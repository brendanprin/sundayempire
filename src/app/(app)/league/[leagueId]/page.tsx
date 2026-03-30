"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  InviteManagementPanel,
  type CommissionerInviteRow,
} from "@/components/commissioner/invite-management-panel";
import { BootstrapDashboard } from "@/components/dashboard/bootstrap-dashboard";
import { DashboardActionCenter } from "@/components/dashboard/dashboard-action-center";
import { DashboardHealthSummaryRow } from "@/components/dashboard/dashboard-health-summary-row";
import { PhaseBadge } from "@/components/dashboard/phase-badge";
import {
  buildDashboardActionItems,
  buildDashboardChangeItems,
  buildDashboardDeadlineCards,
  buildDashboardHealthItems,
  dashboardScopeLabel,
} from "@/components/dashboard/dashboard-view-model";
import { GlobalAlertStrip } from "@/components/layout/global-alert-strip";
import { MirrorOnlyBanner } from "@/components/layout/mirror-only-banner";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { getDashboardModuleGates, shouldPrioritizeSetup } from "@/lib/dashboard/module-readiness-gates";
import { LOGIN_ERROR_SESSION_EXPIRED, buildLoginPath } from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";
import type { DraftHomeProjection } from "@/lib/read-models/draft/types";
import type { TradeHomeResponse } from "@/types/trade-workflow";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

type FounderSetupStatus = "COMPLETE" | "INCOMPLETE_REQUIRED" | "INCOMPLETE_POSTPONED";
type FounderSetupAction = "create" | "claim" | "skip";

type FounderSetupPayload = {
  leagueId: string;
  isComplete: boolean;
  status: FounderSetupStatus;
  hasPostponed: boolean;
  currentTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  claimableTeams: {
    id: string;
    name: string;
    abbreviation: string | null;
    ownerName: string | null;
  }[];
};

type LeagueInvitesPayload = {
  invites: CommissionerInviteRow[];
  capabilities: {
    copyFreshLink: boolean;
  };
};

type SetupBulkImportValidationRow = {
  rowNumber: number;
  status: "valid" | "invalid";
  errors: string[];
  row: {
    ownerName: string;
    ownerEmail: string;
    teamName: string;
    teamAbbreviation: string | null;
    divisionLabel: string | null;
  };
};

type SetupBulkImportApplyResult = {
  rowNumber: number;
  status: "created" | "failed";
  message: string;
  teamId: string | null;
  inviteId: string | null;
};

type SetupBulkImportPayload = {
  mode: "validate" | "apply";
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    createdRows?: number;
    failedRows?: number;
  };
  rows: SetupBulkImportValidationRow[];
  applyResults?: SetupBulkImportApplyResult[];
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeagueLandingDashboardPage() {
  const params = useParams<{ leagueId: string }>();
  const leagueId = params.leagueId;
  const [entryState, setEntryState] = useState<"access_denied" | "session_expired" | "generic" | null>(
    null,
  );
  const [dashboard, setDashboard] = useState<LeagueLandingDashboardProjection | null>(null);
  const [draftsHome, setDraftsHome] = useState<DraftHomeProjection | null>(null);
  const [tradesHome, setTradesHome] = useState<TradeHomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [leagueContextReady, setLeagueContextReady] = useState(false);
  const [founderSetup, setFounderSetup] = useState<FounderSetupPayload | null>(null);
  const [founderSetupLoading, setFounderSetupLoading] = useState(false);
  const [founderSetupError, setFounderSetupError] = useState<string | null>(null);
  const [founderSetupSuccessMessage, setFounderSetupSuccessMessage] = useState<string | null>(null);
  const [founderSetupPendingAction, setFounderSetupPendingAction] = useState<FounderSetupAction | null>(
    null,
  );
  const [founderCreateTeamName, setFounderCreateTeamName] = useState("");
  const [founderCreateTeamAbbreviation, setFounderCreateTeamAbbreviation] = useState("");
  const [founderCreateTeamDivisionLabel, setFounderCreateTeamDivisionLabel] = useState("");
  const [founderClaimTeamId, setFounderClaimTeamId] = useState("");
  const [setupTeamName, setSetupTeamName] = useState("");
  const [setupTeamAbbreviation, setSetupTeamAbbreviation] = useState("");
  const [setupTeamDivisionLabel, setSetupTeamDivisionLabel] = useState("");
  const [setupInviteOwnerName, setSetupInviteOwnerName] = useState("");
  const [setupInviteOwnerEmail, setSetupInviteOwnerEmail] = useState("");
  const [setupInviteTeamName, setSetupInviteTeamName] = useState("");
  const [setupInviteTeamAbbreviation, setSetupInviteTeamAbbreviation] = useState("");
  const [setupInviteDivisionLabel, setSetupInviteDivisionLabel] = useState("");
  const [setupInvites, setSetupInvites] = useState<CommissionerInviteRow[]>([]);
  const [setupInviteCopyFreshLinkEnabled, setSetupInviteCopyFreshLinkEnabled] = useState(false);
  const [setupOpsLoading, setSetupOpsLoading] = useState(false);
  const [setupOpsBusyAction, setSetupOpsBusyAction] = useState<string | null>(null);
  const [setupOpsError, setSetupOpsError] = useState<string | null>(null);
  const [setupOpsMessage, setSetupOpsMessage] = useState<string | null>(null);
  const [setupBulkCsvText, setSetupBulkCsvText] = useState("");
  const [setupBulkBusyAction, setSetupBulkBusyAction] = useState<"validate" | "apply" | null>(null);
  const [setupBulkValidation, setSetupBulkValidation] = useState<SetupBulkImportPayload | null>(null);
  const [setupBulkError, setSetupBulkError] = useState<string | null>(null);
  const [setupBulkMessage, setSetupBulkMessage] = useState<string | null>(null);
  const dashboardViewTracked = useRef(false);
  const firstActionTracked = useRef(false);

  useEffect(() => {
    if (!leagueId) {
      return;
    }

    let mounted = true;
    setLeagueContextReady(false);
    setLoading(true);
    setError(null);
    setEntryState(null);
    setDashboard(null);
    setDraftsHome(null);
    setTradesHome(null);
    setFounderSetup(null);
    setFounderSetupLoading(false);
    setFounderSetupError(null);
    setFounderSetupPendingAction(null);
    setFounderCreateTeamName("");
    setFounderCreateTeamAbbreviation("");
    setFounderCreateTeamDivisionLabel("");
    setFounderClaimTeamId("");
    setSetupTeamName("");
    setSetupTeamAbbreviation("");
    setSetupTeamDivisionLabel("");
    setSetupInviteOwnerName("");
    setSetupInviteOwnerEmail("");
    setSetupInviteTeamName("");
    setSetupInviteTeamAbbreviation("");
    setSetupInviteDivisionLabel("");
    setSetupInvites([]);
    setSetupInviteCopyFreshLinkEnabled(false);
    setSetupOpsLoading(false);
    setSetupOpsBusyAction(null);
    setSetupOpsError(null);
    setSetupOpsMessage(null);
    setSetupBulkCsvText("");
    setSetupBulkBusyAction(null);
    setSetupBulkValidation(null);
    setSetupBulkError(null);
    setSetupBulkMessage(null);
    dashboardViewTracked.current = false;
    firstActionTracked.current = false;

    requestJson(
      "/api/league/context",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          leagueId,
        }),
      },
      "Failed to activate league context.",
    )
      .then(() => {
        if (!mounted) return;
        setLeagueContextReady(true);
      })
      .catch((requestError) => {
        if (!mounted) return;
        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          setEntryState("session_expired");
        } else if (
          requestError instanceof ApiRequestError &&
          requestError.code === "FORBIDDEN"
        ) {
          setEntryState("access_denied");
        } else {
          setEntryState("generic");
        }
        setError(requestError instanceof Error ? requestError.message : "Failed to activate league context.");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [leagueId]);

  useEffect(() => {
    if (!leagueContextReady) {
      return;
    }

    let mounted = true;
    setLoading(true);

    Promise.all([
      requestJson<LeagueLandingDashboardProjection>(
        "/api/league/dashboard",
        undefined,
        "Failed to load the league landing dashboard.",
      ),
      requestJson<TradeHomeResponse>("/api/trades/home").catch(() => null),
      requestJson<DraftHomeProjection>("/api/drafts/home").catch(() => null),
    ])
      .then(([dashboardPayload, tradesHomePayload, draftsHomePayload]) => {
        if (!mounted) return;
        setDashboard(dashboardPayload);
        setTradesHome(tradesHomePayload);
        setDraftsHome(draftsHomePayload);
        setLoading(false);
      })
      .catch((requestError) => {
        if (!mounted) return;
        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          setEntryState("session_expired");
        } else {
          setEntryState("generic");
        }
        setError(
          requestError instanceof Error ? requestError.message : "Failed to load the league landing dashboard.",
        );
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [leagueContextReady]);

  useEffect(() => {
    if (!dashboard || dashboardViewTracked.current) {
      return;
    }

    dashboardViewTracked.current = true;
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_DASHBOARD_VIEWED,
      pagePath: `/league/${leagueId}`,
      eventStep: "view",
      status: "success",
      entityType: "dashboard",
      entityId: dashboard.viewer.leagueRole,
      context: {
        leagueRole: dashboard.viewer.leagueRole,
        hasTeamAccess: dashboard.viewer.hasTeamAccess,
        seasonPhase: dashboard.leagueDashboard.season?.currentPhase ?? null,
      },
    });
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_LEAGUE_HOME_VIEWED,
      pagePath: `/league/${leagueId}`,
      eventStep: "view",
      status: "success",
      entityType: "league_home",
      entityId: dashboard.leagueDashboard.league.id,
      context: {
        leagueRole: dashboard.viewer.leagueRole,
        hasTeamAccess: dashboard.viewer.hasTeamAccess,
        seasonPhase: dashboard.leagueDashboard.season?.currentPhase ?? null,
      },
    });
  }, [dashboard, leagueId]);

  useEffect(() => {
    if (!leagueContextReady || !dashboard || dashboard.viewer.leagueRole !== "COMMISSIONER") {
      setFounderSetup(null);
      setFounderSetupError(null);
      setFounderSetupLoading(false);
      return;
    }

    let mounted = true;
    setFounderSetupLoading(true);
    setFounderSetupError(null);

    requestJson<{ founderSetup: FounderSetupPayload }>(
      "/api/league/founder-team",
      { cache: "no-store" },
      "Failed to load founder team setup status.",
    )
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setFounderSetup(payload.founderSetup);
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }

        if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
          setFounderSetup(null);
          setFounderSetupError(null);
          return;
        }

        setFounderSetupError(
          requestError instanceof Error ? requestError.message : "Failed to load founder team setup status.",
        );
      })
      .finally(() => {
        if (mounted) {
          setFounderSetupLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [dashboard, leagueContextReady]);

  useEffect(() => {
    if (!founderSetup || founderSetup.claimableTeams.length === 0) {
      setFounderClaimTeamId("");
      return;
    }

    setFounderClaimTeamId((current) => {
      if (current && founderSetup.claimableTeams.some((team) => team.id === current)) {
        return current;
      }
      return founderSetup.claimableTeams[0]?.id ?? "";
    });
  }, [founderSetup]);

  async function loadSetupInvites() {
    const payload = await requestJson<LeagueInvitesPayload>(
      "/api/league/invites",
      { cache: "no-store" },
      "Failed to load setup invites.",
    );

    setSetupInvites(payload.invites);
    setSetupInviteCopyFreshLinkEnabled(payload.capabilities.copyFreshLink);
  }

  useEffect(() => {
    if (!leagueContextReady || !dashboard || dashboard.viewer.leagueRole !== "COMMISSIONER") {
      setSetupInvites([]);
      setSetupInviteCopyFreshLinkEnabled(false);
      setSetupOpsLoading(false);
      setSetupOpsError(null);
      setSetupBulkCsvText("");
      setSetupBulkValidation(null);
      setSetupBulkBusyAction(null);
      setSetupBulkError(null);
      setSetupBulkMessage(null);
      return;
    }

    let mounted = true;
    setSetupOpsLoading(true);
    setSetupOpsError(null);

    loadSetupInvites()
      .catch((requestError) => {
        if (!mounted) {
          return;
        }

        if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
          setSetupInvites([]);
          setSetupInviteCopyFreshLinkEnabled(false);
          setSetupOpsError(null);
          return;
        }

        setSetupOpsError(requestError instanceof Error ? requestError.message : "Failed to load setup invites.");
      })
      .finally(() => {
        if (mounted) {
          setSetupOpsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [dashboard, leagueContextReady]);

  async function refreshDashboardSurfaces() {
    const [dashboardPayload, tradesHomePayload, draftsHomePayload] = await Promise.all([
      requestJson<LeagueLandingDashboardProjection>(
        "/api/league/dashboard",
        undefined,
        "Failed to reload the league landing dashboard.",
      ),
      requestJson<TradeHomeResponse>("/api/trades/home").catch(() => null),
      requestJson<DraftHomeProjection>("/api/drafts/home").catch(() => null),
    ]);

    setDashboard(dashboardPayload);
    setTradesHome(tradesHomePayload);
    setDraftsHome(draftsHomePayload);
  }

  async function submitFounderSetupAction(
    action: FounderSetupAction,
    payload: Record<string, unknown> = {},
  ) {
    setFounderSetupPendingAction(action);
    setFounderSetupError(null);
    setFounderSetupSuccessMessage(null);

    try {
      const founderResponse = await requestJson<{ founderSetup: FounderSetupPayload }>(
        "/api/league/founder-team",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action,
            ...payload,
          }),
        },
        "Founder team setup update failed.",
      );

      setFounderSetup(founderResponse.founderSetup);
      await refreshDashboardSurfaces();
      return true;
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        setEntryState("session_expired");
      } else if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
        setEntryState("access_denied");
      }

      setFounderSetupError(
        requestError instanceof Error ? requestError.message : "Founder team setup update failed.",
      );
      return false;
    } finally {
      setFounderSetupPendingAction(null);
    }
  }

  async function handleFounderCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const teamName = founderCreateTeamName.trim();
    if (teamName.length < 2) {
      setFounderSetupError("Team name must be at least 2 characters.");
      return;
    }

    const teamAbbreviation = founderCreateTeamAbbreviation.trim().toUpperCase();
    if (teamAbbreviation.length > 8) {
      setFounderSetupError("Team abbreviation must be 8 characters or fewer.");
      return;
    }

    const success = await submitFounderSetupAction("create", {
      teamName,
      teamAbbreviation: teamAbbreviation || null,
      divisionLabel: founderCreateTeamDivisionLabel.trim() || null,
    });

    if (success) {
      const teamName = founderCreateTeamName.trim();
      setFounderSetupSuccessMessage(
        `${teamName} created successfully. Next recommended step: Add teams for other members.`
      );
      
      // Auto-dismiss success message after 8 seconds
      setTimeout(() => {
        setFounderSetupSuccessMessage(null);
      }, 8000);
      
      setFounderCreateTeamName("");
      setFounderCreateTeamAbbreviation("");
      setFounderCreateTeamDivisionLabel("");
    }
  }

  async function handleFounderClaimSubmit() {
    if (!founderClaimTeamId) {
      setFounderSetupError("Select a team to claim.");
      return;
    }

    await submitFounderSetupAction("claim", {
      teamId: founderClaimTeamId,
    });
  }

  async function handleFounderSkip() {
    await submitFounderSetupAction("skip");
  }

  async function handleSetupCreateTeamSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = setupTeamName.trim();
    if (name.length < 2) {
      setSetupOpsError("Team name must be at least 2 characters.");
      return;
    }

    const abbreviation = setupTeamAbbreviation.trim().toUpperCase();
    if (abbreviation.length > 8) {
      setSetupOpsError("Team abbreviation must be 8 characters or fewer.");
      return;
    }

    setSetupOpsBusyAction("setup:team:create");
    setSetupOpsError(null);
    setSetupOpsMessage(null);

    try {
      const payload = await requestJson<{ team: { name: string } }>(
        "/api/teams",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name,
            abbreviation: abbreviation || null,
            divisionLabel: setupTeamDivisionLabel.trim() || null,
          }),
        },
        "Failed to create team from setup flow.",
      );

      setSetupTeamName("");
      setSetupTeamAbbreviation("");
      setSetupOpsMessage(`Created team ${payload.team.name}.`);
      await refreshDashboardSurfaces();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        setEntryState("session_expired");
      } else if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
        setEntryState("access_denied");
      }
      setSetupOpsError(
        requestError instanceof Error ? requestError.message : "Failed to create team from setup flow.",
      );
    } finally {
      setSetupOpsBusyAction(null);
    }
  }

  async function handleSetupInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const ownerName = setupInviteOwnerName.trim();
    const ownerEmail = setupInviteOwnerEmail.trim().toLowerCase();
    const teamName = setupInviteTeamName.trim();
    const teamAbbreviation = setupInviteTeamAbbreviation.trim().toUpperCase();
    const divisionLabel = setupInviteDivisionLabel.trim();

    if (ownerName.length < 2) {
      setSetupOpsError("Owner name must be at least 2 characters.");
      return;
    }
    if (!EMAIL_PATTERN.test(ownerEmail)) {
      setSetupOpsError("Owner email must be a valid email address.");
      return;
    }
    if (teamName.length < 2) {
      setSetupOpsError("Team name must be at least 2 characters.");
      return;
    }
    if (teamAbbreviation.length > 8) {
      setSetupOpsError("Team abbreviation must be 8 characters or fewer.");
      return;
    }

    setSetupOpsBusyAction("setup:invite:create");
    setSetupOpsError(null);
    setSetupOpsMessage(null);

    try {
      const payload = await requestJson<{
        owner: { name: string };
        team: { name: string };
        delivery: { label: string; detail: string };
      }>(
        "/api/league/invites",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            ownerName,
            ownerEmail,
            teamName,
            teamAbbreviation: teamAbbreviation || null,
            divisionLabel: divisionLabel || null,
          }),
        },
        "Failed to invite member from setup flow.",
      );

      setSetupInviteOwnerName("");
      setSetupInviteOwnerEmail("");
      setSetupInviteTeamName("");
      setSetupInviteTeamAbbreviation("");
      setSetupOpsMessage(
        `Invited ${payload.owner.name} and created ${payload.team.name}. ${payload.delivery.label}: ${payload.delivery.detail}`,
      );
      await Promise.all([refreshDashboardSurfaces(), loadSetupInvites()]);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        setEntryState("session_expired");
      } else if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
        setEntryState("access_denied");
      }
      setSetupOpsError(
        requestError instanceof Error ? requestError.message : "Failed to invite member from setup flow.",
      );
    } finally {
      setSetupOpsBusyAction(null);
    }
  }

  async function handleSetupBulkValidate() {
    const csvText = setupBulkCsvText.trim();
    if (!csvText) {
      setSetupBulkError("Paste CSV rows before running validation.");
      return;
    }

    setSetupBulkBusyAction("validate");
    setSetupBulkError(null);
    setSetupBulkMessage(null);

    try {
      const payload = await requestJson<SetupBulkImportPayload>(
        "/api/teams/bootstrap",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mode: "validate",
            csvText,
          }),
        },
        "Failed to validate bulk team template.",
      );

      setSetupBulkValidation(payload);
      setSetupBulkMessage(
        `Validation complete: ${payload.summary.validRows} valid, ${payload.summary.invalidRows} invalid.`,
      );
    } catch (requestError) {
      setSetupBulkError(
        requestError instanceof Error ? requestError.message : "Failed to validate bulk team template.",
      );
    } finally {
      setSetupBulkBusyAction(null);
    }
  }

  async function handleSetupBulkApply() {
    const csvText = setupBulkCsvText.trim();
    if (!csvText) {
      setSetupBulkError("Paste CSV rows before applying import.");
      return;
    }

    setSetupBulkBusyAction("apply");
    setSetupBulkError(null);
    setSetupBulkMessage(null);

    try {
      const payload = await requestJson<SetupBulkImportPayload>(
        "/api/teams/bootstrap",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            mode: "apply",
            csvText,
          }),
        },
        "Failed to apply bulk team import.",
      );

      setSetupBulkValidation(payload);
      setSetupBulkMessage(
        `Apply complete: ${payload.summary.createdRows ?? 0} created, ${payload.summary.failedRows ?? 0} failed.`,
      );
      await Promise.all([refreshDashboardSurfaces(), loadSetupInvites()]);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        setEntryState("session_expired");
      } else if (requestError instanceof ApiRequestError && requestError.code === "FORBIDDEN") {
        setEntryState("access_denied");
      }
      setSetupBulkError(
        requestError instanceof Error ? requestError.message : "Failed to apply bulk team import.",
      );
    } finally {
      setSetupBulkBusyAction(null);
    }
  }

  async function handleSetupInviteResend(invite: CommissionerInviteRow) {
    setSetupOpsBusyAction(`invite:resend:${invite.id}`);
    setSetupOpsError(null);
    setSetupOpsMessage(null);

    try {
      await requestJson(
        `/api/league/invites/${invite.id}/resend`,
        {
          method: "POST",
        },
        "Failed to resend invite.",
      );

      await Promise.all([refreshDashboardSurfaces(), loadSetupInvites()]);
      setSetupOpsMessage(`Reissued invite for ${invite.email}.`);
    } catch (requestError) {
      setSetupOpsError(requestError instanceof Error ? requestError.message : "Failed to resend invite.");
    } finally {
      setSetupOpsBusyAction(null);
    }
  }

  async function handleSetupInviteRevoke(invite: CommissionerInviteRow) {
    const confirmed = window.confirm(
      `Revoke invite for ${invite.email}? They will need a new link to join.`,
    );
    if (!confirmed) {
      return;
    }

    setSetupOpsBusyAction(`invite:revoke:${invite.id}`);
    setSetupOpsError(null);
    setSetupOpsMessage(null);

    try {
      await requestJson(
        `/api/league/invites/${invite.id}/revoke`,
        {
          method: "POST",
        },
        "Failed to revoke invite.",
      );

      await Promise.all([refreshDashboardSurfaces(), loadSetupInvites()]);
      setSetupOpsMessage(`Revoked invite for ${invite.email}.`);
    } catch (requestError) {
      setSetupOpsError(requestError instanceof Error ? requestError.message : "Failed to revoke invite.");
    } finally {
      setSetupOpsBusyAction(null);
    }
  }

  async function handleSetupCopyFreshInviteLink(invite: CommissionerInviteRow) {
    setSetupOpsBusyAction(`invite:copy:${invite.id}`);
    setSetupOpsError(null);
    setSetupOpsMessage(null);

    try {
      const payload = await requestJson<{
        inviteUrl: string;
      }>(
        `/api/league/invites/${invite.id}/copy-link`,
        {
          method: "POST",
        },
        "Failed to copy fresh invite link.",
      );

      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.inviteUrl);
        setSetupOpsMessage(`Copied fresh invite link for ${invite.email}.`);
      } else {
        window.prompt("Copy invite link", payload.inviteUrl);
        setSetupOpsMessage(`Generated fresh invite link for ${invite.email}.`);
      }

      await Promise.all([refreshDashboardSurfaces(), loadSetupInvites()]);
    } catch (requestError) {
      setSetupOpsError(
        requestError instanceof Error ? requestError.message : "Failed to copy fresh invite link.",
      );
    } finally {
      setSetupOpsBusyAction(null);
    }
  }

  const mirrorOnly = dashboard?.leagueDashboard.status.mirrorOnly ?? false;
  const phaseTone =
    dashboard?.leagueDashboard.status.alertLevel === "critical"
      ? "critical"
      : dashboard?.leagueDashboard.status.alertLevel === "warning" ||
          dashboard?.leagueDashboard.status.alertLevel === "setup_required"
        ? "warning"
        : "neutral";
  const visibleAlerts =
    dashboard?.alerts.filter((alert) => !(mirrorOnly && alert.id === "league-status")) ?? [];
  const dashboardActionItems = dashboard
    ? buildDashboardActionItems({ dashboard, draftsHome, tradesHome })
    : [];
  const moduleGates = dashboard ? getDashboardModuleGates(dashboard) : null;
  const prioritizeSetup = dashboard ? shouldPrioritizeSetup(dashboard) : false;
  const firstDashboardAction = dashboardActionItems[0] ?? null;
  const prioritizeSecondaryActivity = dashboard
    ? dashboard.viewer.leagueRole === "COMMISSIONER" || !dashboard.viewer.hasTeamAccess
    : false;
  const secondaryRecommendationLabel = prioritizeSecondaryActivity ? "League Activity" : "Picks & Draft";
  const firstActionPrompt = firstDashboardAction
    ? `${firstDashboardAction.title} (${firstDashboardAction.ctaLabel}).`
    : "Open the Action Center first.";
  const headerDescription = dashboard
    ? dashboard.viewer.teamName
      ? `${dashboard.viewer.teamName} is in Season ${dashboard.leagueDashboard.season?.year ?? "?"}. First action: ${firstActionPrompt} Then scan change and the next deadline.`
      : dashboard.setupChecklist.available && !dashboard.setupChecklist.isComplete
        ? `League-wide command center for Season ${dashboard.leagueDashboard.season?.year ?? "?"}. Setup progress is ${dashboard.setupChecklist.completedItemCount}/${dashboard.setupChecklist.totalItemCount}. First setup action: ${firstActionPrompt}`
        : `League-wide command center for Season ${dashboard.leagueDashboard.season?.year ?? "?"}. First action: ${firstActionPrompt} Use secondary reads only after priority workflows.`
    : "Resolving current season, urgent work, deadlines, and recent change across the active league workspace.";

  function recordDashboardAction(
    actionId: string,
    source: "action-center" | "mobile-rail" | "secondary-zone",
  ) {
    const context = {
      source,
      leagueRole: dashboard?.viewer.leagueRole ?? null,
      hasTeamAccess: dashboard?.viewer.hasTeamAccess ?? null,
    };

    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_DASHBOARD_ACTION_SELECTED,
      pagePath: `/league/${leagueId}`,
      eventStep: "select",
      status: "success",
      entityType: "dashboard_action",
      entityId: actionId,
      context,
    });

    if (!firstActionTracked.current) {
      firstActionTracked.current = true;

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_DASHBOARD_FIRST_ACTION,
        pagePath: `/league/${leagueId}`,
        eventStep: "select",
        status: "success",
        entityType: "dashboard_action",
        entityId: actionId,
        context,
      });
      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_LEAGUE_HOME_FIRST_ACTION,
        pagePath: `/league/${leagueId}`,
        eventStep: "select",
        status: "success",
        entityType: "dashboard_action",
        entityId: actionId,
        context,
      });
    }
  }

  return (
    <div className="space-y-6" data-testid="league-landing-dashboard">
      <PageHeaderBand
        eyebrow="Dashboard"
        eyebrowTestId="dashboard-page-eyebrow"
        title={dashboard?.leagueDashboard.league.name ?? "Loading league workspace..."}
        titleTestId="dashboard-active-league-name"
        description={headerDescription}
        supportingContent={
          <div className="flex flex-wrap items-center gap-3">
            <PhaseBadge
              label={formatLeaguePhaseLabel(dashboard?.leagueDashboard.season?.currentPhase ?? null)}
              tone={phaseTone}
              testId="league-landing-phase-badge"
            />
            <span className="shell-chip shell-chip--neutral">
              {dashboard ? dashboardScopeLabel(dashboard.viewer) : "Resolving workspace scope"}
            </span>
            <span className="shell-chip shell-chip--neutral">
              {dashboard
                ? `${dashboard.notificationSummary.unreadCount} unread update${dashboard.notificationSummary.unreadCount === 1 ? "" : "s"}`
                : "Unread updates pending"}
            </span>
            <span className={mirrorOnly ? "shell-chip shell-chip--warning" : "shell-chip shell-chip--neutral"}>
              {mirrorOnly ? "Regular-season mirror-only sync" : "Canonical offseason tools available"}
            </span>
          </div>
        }
      />

      {entryState === "access_denied" && error ? (
        <div
          className="rounded-xl border border-amber-800 bg-amber-950/40 px-4 py-4 text-sm text-amber-100"
          data-testid="league-access-denied-panel"
        >
          <p className="font-medium">You do not have access to this league.</p>
          <p className="mt-2 text-amber-50/90">
            If you expected to see this workspace, ask the commissioner to confirm your membership or choose another league.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-50 transition hover:border-amber-400"
            >
              Choose Another League
            </Link>
            <Link
              href={buildLoginPath({
                returnTo: "/",
                switchSession: true,
              })}
              className="rounded-md border border-amber-500/40 px-3 py-2 text-xs font-medium text-amber-50 transition hover:border-amber-400"
            >
              Use Another Account
            </Link>
          </div>
        </div>
      ) : null}

      {entryState === "session_expired" && error ? (
        <div
          className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-4 text-sm text-red-100"
          data-testid="league-session-expired-panel"
        >
          <p className="font-medium">Your session expired before this league could load.</p>
          <p className="mt-2 text-red-50/90">{error}</p>
          <div className="mt-3">
            <Link
              href={buildLoginPath({
                returnTo: `/league/${leagueId}`,
                error: LOGIN_ERROR_SESSION_EXPIRED,
              })}
              className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-medium text-red-50 transition hover:border-red-400"
            >
              Sign In Again
            </Link>
          </div>
        </div>
      ) : null}

      {entryState === "generic" && error ? (
        <div className="rounded-xl border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          Dashboard data could not load. Existing league records are unchanged. {error}
        </div>
      ) : null}

      {mirrorOnly ? (
        <MirrorOnlyBanner
          message="Regular season mirror-only mode is active"
          detail="Roster changes are blocked until post-season. Use the dashboard for cap, contract, and compliance visibility."
        />
      ) : null}

      {loading && !dashboard ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-400">
            Loading the action center, deadline stack, change feed, and dashboard posture.
          </p>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.95fr)]">
            <div className="h-80 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
            <div className="space-y-4">
              <div className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
              <div className="h-44 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-800 bg-slate-950/60" />
            ))}
          </div>
        </div>
      ) : null}

      {dashboard && dashboard.viewer.leagueRole === "COMMISSIONER" && dashboard.setupChecklist.available && !dashboard.setupChecklist.isComplete ? (
        <BootstrapDashboard
          dashboard={dashboard}
          founderSetup={founderSetup}
          founderSetupLoading={founderSetupLoading}
          founderSetupError={founderSetupError}
          founderSetupSuccessMessage={founderSetupSuccessMessage}
          founderSetupPendingAction={founderSetupPendingAction}
          founderCreateTeamName={founderCreateTeamName}
          founderCreateTeamAbbreviation={founderCreateTeamAbbreviation}
          founderCreateTeamDivisionLabel={founderCreateTeamDivisionLabel}
          founderClaimTeamId={founderClaimTeamId}
          setupTeamName={setupTeamName}
          setupTeamAbbreviation={setupTeamAbbreviation}
          setupTeamDivisionLabel={setupTeamDivisionLabel}
          setupInviteOwnerName={setupInviteOwnerName}
          setupInviteOwnerEmail={setupInviteOwnerEmail}
          setupInviteTeamName={setupInviteTeamName}
          setupInviteTeamAbbreviation={setupInviteTeamAbbreviation}
          setupInviteDivisionLabel={setupInviteDivisionLabel}
          setupInvites={setupInvites}
          setupInviteCopyFreshLinkEnabled={setupInviteCopyFreshLinkEnabled}
          setupOpsLoading={setupOpsLoading}
          setupOpsBusyAction={setupOpsBusyAction}
          setupOpsError={setupOpsError}
          setupOpsMessage={setupOpsMessage}
          setupBulkCsvText={setupBulkCsvText}
          setupBulkBusyAction={setupBulkBusyAction}
          setupBulkValidation={setupBulkValidation}
          setupBulkError={setupBulkError}
          setupBulkMessage={setupBulkMessage}
          setFounderCreateTeamName={setFounderCreateTeamName}
          setFounderCreateTeamAbbreviation={setFounderCreateTeamAbbreviation}
          setFounderCreateTeamDivisionLabel={setFounderCreateTeamDivisionLabel}
          setFounderClaimTeamId={setFounderClaimTeamId}
          setSetupTeamName={setSetupTeamName}
          setSetupTeamAbbreviation={setSetupTeamAbbreviation}
          setSetupTeamDivisionLabel={setSetupTeamDivisionLabel}
          setSetupInviteOwnerName={setSetupInviteOwnerName}
          setSetupInviteOwnerEmail={setSetupInviteOwnerEmail}
          setSetupInviteTeamName={setSetupInviteTeamName}
          setSetupInviteTeamAbbreviation={setSetupInviteTeamAbbreviation}
          setSetupInviteDivisionLabel={setSetupInviteDivisionLabel}
          setSetupBulkCsvText={setSetupBulkCsvText}
          onFounderCreateSubmit={handleFounderCreateSubmit}
          onFounderClaimSubmit={handleFounderClaimSubmit}
          onFounderSkip={handleFounderSkip}
          onSetupCreateTeamSubmit={handleSetupCreateTeamSubmit}
          onSetupInviteSubmit={handleSetupInviteSubmit}
          onSetupBulkValidate={handleSetupBulkValidate}
          onSetupBulkApply={handleSetupBulkApply}
          onSetupInviteResend={handleSetupInviteResend}
          onSetupInviteRevoke={handleSetupInviteRevoke}
          onSetupCopyFreshInviteLink={handleSetupCopyFreshInviteLink}
        />
      ) : null}

      {dashboard && !(dashboard.viewer.leagueRole === "COMMISSIONER" && dashboard.setupChecklist.available && !dashboard.setupChecklist.isComplete) ? (
        <div className="space-y-4">
          {dashboard.viewer.leagueRole === "COMMISSIONER" &&
          (founderSetupLoading || founderSetupError || !founderSetup || !founderSetup.isComplete) ? (
            <section
              id="founder-team-setup"
              className="space-y-4 rounded-2xl border-2 border-amber-500/60 bg-[linear-gradient(160deg,rgba(245,158,11,0.15),rgba(15,23,42,0.94)_40%,rgba(2,6,23,0.96))] p-6 shadow-[0_24px_64px_rgba(245,158,11,0.25)]"
              data-testid="founder-team-setup-panel"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-amber-400/60 bg-amber-500/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                      Primary Action
                    </span>
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-amber-100">
                    Set Up Your Founder Team
                  </h2>
                  <p className="mt-2 text-amber-50/90">
                    Complete this setup to unlock the full league management dashboard. Choose your franchise now or postpone for later.
                  </p>
                </div>
                <span
                  className="rounded-full border border-amber-400/60 bg-amber-500/20 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-amber-100"
                  data-testid="founder-team-setup-status"
                >
                  {founderSetupLoading
                    ? "Checking"
                    : founderSetup?.status === "INCOMPLETE_POSTPONED"
                      ? "Postponed"
                      : "Required"}
                </span>
              </div>

              {founderSetup?.status === "INCOMPLETE_POSTPONED" ? (
                <div
                  className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100"
                  data-testid="founder-team-postponed-note"
                >
                  Team setup is postponed and still incomplete.
                </div>
              ) : null}

              {founderSetupError ? (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100">
                  {founderSetupError}
                </div>
              ) : null}

              {founderSetupLoading ? (
                <p className="text-sm text-amber-100/80">Loading founder team options...</p>
              ) : founderSetup ? (
                <div className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <form
                      className="space-y-3 rounded-xl border border-amber-800/40 bg-black/20 p-4"
                      onSubmit={handleFounderCreateSubmit}
                      data-testid="founder-team-create-form"
                    >
                      <h3 className="text-sm font-medium text-amber-100">Create Team</h3>
                      <label className="block text-xs text-amber-100/90">
                        Team name
                        <input
                          value={founderCreateTeamName}
                          onChange={(event) => setFounderCreateTeamName(event.target.value)}
                          className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                          placeholder="Empire Originals"
                          data-testid="founder-team-create-name-input"
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="block text-xs text-amber-100/90">
                          Abbreviation
                          <input
                            value={founderCreateTeamAbbreviation}
                            onChange={(event) => setFounderCreateTeamAbbreviation(event.target.value)}
                            className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                            placeholder="EOR"
                            data-testid="founder-team-create-abbreviation-input"
                          />
                        </label>
                        <label className="block text-xs text-amber-100/90">
                          Division
                          <input
                            value={founderCreateTeamDivisionLabel}
                            onChange={(event) => setFounderCreateTeamDivisionLabel(event.target.value)}
                            className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                            placeholder="East"
                            data-testid="founder-team-create-division-input"
                          />
                        </label>
                      </div>
                      <button
                        type="submit"
                        className="rounded-md border border-amber-500/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={Boolean(founderSetupPendingAction)}
                        data-testid="founder-team-create-submit"
                      >
                        {founderSetupPendingAction === "create" ? "Creating..." : "Create Team"}
                      </button>
                    </form>

                    <div className="space-y-3 rounded-xl border border-amber-800/40 bg-black/20 p-4">
                      <h3 className="text-sm font-medium text-amber-100">Claim Existing Team</h3>
                      {founderSetup.claimableTeams.length > 0 ? (
                        <>
                          <label className="block text-xs text-amber-100/90">
                            Available teams
                            <select
                              value={founderClaimTeamId}
                              onChange={(event) => setFounderClaimTeamId(event.target.value)}
                              className="mt-1 w-full rounded-md border border-amber-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                              data-testid="founder-team-claim-select"
                            >
                              {founderSetup.claimableTeams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                  {team.abbreviation ? ` (${team.abbreviation})` : ""}
                                  {team.ownerName ? ` · Owner: ${team.ownerName}` : ""}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="rounded-md border border-amber-500/70 bg-amber-950/50 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void handleFounderClaimSubmit()}
                            disabled={Boolean(founderSetupPendingAction) || !founderClaimTeamId}
                            data-testid="founder-team-claim-submit"
                          >
                            {founderSetupPendingAction === "claim" ? "Claiming..." : "Claim Team"}
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-amber-100/80">
                          No claimable team is available yet. Create one now, or return after you add more teams.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-800/40 bg-black/20 p-4">
                    <p className="text-xs text-amber-100/80">
                      Skip for now keeps your commissioner role active and marks this setup as incomplete.
                    </p>
                    <button
                      type="button"
                      className="rounded-md border border-amber-500/60 px-3 py-2 text-xs font-medium text-amber-100 transition hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void handleFounderSkip()}
                      disabled={Boolean(founderSetupPendingAction)}
                      data-testid="founder-team-skip"
                    >
                      {founderSetupPendingAction === "skip" ? "Saving..." : "Skip For Now"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {dashboard.viewer.leagueRole === "COMMISSIONER" &&
          (setupOpsLoading ||
            !dashboard.setupChecklist.isComplete ||
            setupInvites.some((invite) => invite.status === "pending")) ? (
            <section
              id="setup-bootstrap-panel"
              className="space-y-4 rounded-2xl border border-sky-700/35 bg-sky-950/10 p-5"
              data-testid="setup-bootstrap-panel"
            >
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-sky-300/80">League Bootstrap</p>
                <h2 className="mt-1 text-base font-medium text-sky-100">Add teams and send invites from setup</h2>
                <p className="mt-1 text-sm text-sky-50/80">
                  Keep setup momentum in league home without detouring into legacy commissioner pages.
                </p>
              </div>

              {setupOpsError ? (
                <div className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100">
                  {setupOpsError}
                </div>
              ) : null}
              {setupOpsMessage ? (
                <div className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100">
                  {setupOpsMessage}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-2">
                <form
                  className="space-y-3 rounded-xl border border-sky-800/40 bg-black/20 p-4"
                  onSubmit={handleSetupCreateTeamSubmit}
                  data-testid="setup-create-team-form"
                >
                  <h3 className="text-sm font-medium text-sky-100">Create Team</h3>
                  <label className="block text-xs text-sky-100/90">
                    Team name
                    <input
                      value={setupTeamName}
                      onChange={(event) => setSetupTeamName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      placeholder="Expansion Club"
                      data-testid="setup-create-team-name"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-sky-100/90">
                      Abbreviation
                      <input
                        value={setupTeamAbbreviation}
                        onChange={(event) => setSetupTeamAbbreviation(event.target.value)}
                        className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                        placeholder="EXP"
                        data-testid="setup-create-team-abbr"
                      />
                    </label>
                    <label className="block text-xs text-sky-100/90">
                      Division
                      <input
                        value={setupTeamDivisionLabel}
                        onChange={(event) => setSetupTeamDivisionLabel(event.target.value)}
                        className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="North"
                        data-testid="setup-create-team-division"
                      />
                    </label>
                  </div>
                  <button
                    type="submit"
                    className="rounded-md border border-sky-500/70 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(setupOpsBusyAction)}
                    data-testid="setup-create-team-submit"
                  >
                    {setupOpsBusyAction === "setup:team:create" ? "Creating..." : "Create Team"}
                  </button>
                </form>

                <form
                  className="space-y-3 rounded-xl border border-sky-800/40 bg-black/20 p-4"
                  onSubmit={handleSetupInviteSubmit}
                  data-testid="setup-invite-form"
                >
                  <h3 className="text-sm font-medium text-sky-100">Invite Member + Team</h3>
                  <label className="block text-xs text-sky-100/90">
                    Owner name
                    <input
                      value={setupInviteOwnerName}
                      onChange={(event) => setSetupInviteOwnerName(event.target.value)}
                      className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      placeholder="Alex Owner"
                      data-testid="setup-invite-owner-name"
                    />
                  </label>
                  <label className="block text-xs text-sky-100/90">
                    Owner email
                    <input
                      value={setupInviteOwnerEmail}
                      onChange={(event) => setSetupInviteOwnerEmail(event.target.value)}
                      className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      placeholder="alex@example.com"
                      data-testid="setup-invite-owner-email"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-xs text-sky-100/90">
                      Team name
                      <input
                        value={setupInviteTeamName}
                        onChange={(event) => setSetupInviteTeamName(event.target.value)}
                        className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                        placeholder="Gridiron Ghosts"
                        data-testid="setup-invite-team-name"
                      />
                    </label>
                    <label className="block text-xs text-sky-100/90">
                      Team abbr
                      <input
                        value={setupInviteTeamAbbreviation}
                        onChange={(event) => setSetupInviteTeamAbbreviation(event.target.value)}
                        className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm uppercase text-slate-100"
                        placeholder="GGH"
                        data-testid="setup-invite-team-abbr"
                      />
                    </label>
                  </div>
                  <label className="block text-xs text-sky-100/90">
                    Division
                    <input
                      value={setupInviteDivisionLabel}
                      onChange={(event) => setSetupInviteDivisionLabel(event.target.value)}
                      className="mt-1 w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      placeholder="South"
                      data-testid="setup-invite-division"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-sky-500/70 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(setupOpsBusyAction)}
                    data-testid="setup-invite-submit"
                  >
                    {setupOpsBusyAction === "setup:invite:create" ? "Inviting..." : "Invite Member + Team"}
                  </button>
                </form>
              </div>

              <div
                className="space-y-3 rounded-xl border border-sky-800/35 bg-slate-950/40 p-4"
                data-testid="setup-bulk-import-panel"
              >
                <div>
                  <h3 className="text-sm font-medium text-sky-100">Bulk Team Import (CSV)</h3>
                  <p className="mt-1 text-xs text-slate-300">
                    Import multiple owner + team rows at once. Validate first, then apply from the same template.
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400" data-testid="setup-bulk-template-hint">
                    Headers: ownerName, ownerEmail, teamName, teamAbbreviation, divisionLabel
                  </p>
                </div>

                <textarea
                  value={setupBulkCsvText}
                  onChange={(event) => {
                    setSetupBulkCsvText(event.target.value);
                    setSetupBulkValidation(null);
                    setSetupBulkError(null);
                    setSetupBulkMessage(null);
                  }}
                  className="min-h-[7rem] w-full rounded-md border border-sky-700/50 bg-slate-950/70 px-3 py-2 text-xs text-slate-100"
                  placeholder={`ownerName,ownerEmail,teamName,teamAbbreviation,divisionLabel\nAlex Owner,alex@example.com,Empire East,EME,East`}
                  data-testid="setup-bulk-csv-input"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSetupBulkValidate()}
                    className="rounded-md border border-sky-500/70 bg-sky-950/50 px-3 py-2 text-xs font-medium text-sky-100 transition hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={Boolean(setupBulkBusyAction)}
                    data-testid="setup-bulk-validate-submit"
                  >
                    {setupBulkBusyAction === "validate" ? "Validating..." : "Validate Template"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSetupBulkApply()}
                    className="rounded-md border border-emerald-500/70 bg-emerald-950/50 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={
                      Boolean(setupBulkBusyAction) ||
                      !setupBulkValidation ||
                      setupBulkValidation.summary.validRows === 0
                    }
                    data-testid="setup-bulk-apply-submit"
                  >
                    {setupBulkBusyAction === "apply" ? "Applying..." : "Apply Valid Rows"}
                  </button>
                </div>

                {setupBulkError ? (
                  <div
                    className="rounded-lg border border-red-800/60 bg-red-950/30 px-3 py-2 text-xs text-red-100"
                    data-testid="setup-bulk-error"
                  >
                    {setupBulkError}
                  </div>
                ) : null}

                {setupBulkMessage ? (
                  <div
                    className="rounded-lg border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-100"
                    data-testid="setup-bulk-message"
                  >
                    {setupBulkMessage}
                  </div>
                ) : null}

                {setupBulkValidation ? (
                  <div className="space-y-2" data-testid="setup-bulk-summary">
                    <p className="text-xs text-slate-300">
                      {setupBulkValidation.summary.totalRows} rows · {setupBulkValidation.summary.validRows} valid ·{" "}
                      {setupBulkValidation.summary.invalidRows} invalid
                    </p>
                    <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                      {setupBulkValidation.rows.slice(0, 12).map((row) => (
                        <article
                          key={row.rowNumber}
                          className={`rounded-md border px-2.5 py-2 text-xs ${
                            row.status === "valid"
                              ? "border-emerald-800/50 bg-emerald-950/20 text-emerald-100"
                              : "border-red-800/50 bg-red-950/20 text-red-100"
                          }`}
                          data-testid={`setup-bulk-row-${row.rowNumber}`}
                        >
                          <p className="font-medium">
                            Row {row.rowNumber}: {row.row.teamName || "Unknown Team"} ({row.row.ownerEmail || "no-email"})
                          </p>
                          {row.errors.length > 0 ? (
                            <p className="mt-1 opacity-90">{row.errors.join(" ")}</p>
                          ) : (
                            <p className="mt-1 opacity-90">Ready to import.</p>
                          )}
                        </article>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-sky-800/35 bg-slate-950/40 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-sky-100">Pending Invites</h3>
                  <span className="rounded-full border border-sky-700/50 px-2 py-0.5 text-[11px] text-sky-200">
                    {setupInvites.filter((invite) => invite.status === "pending").length} pending
                  </span>
                </div>
                {setupOpsLoading ? (
                  <p className="text-xs text-slate-300">Loading invite state...</p>
                ) : (
                  <InviteManagementPanel
                    invites={setupInvites}
                    copyFreshLinkEnabled={setupInviteCopyFreshLinkEnabled}
                    busyAction={setupOpsBusyAction}
                    onResend={(invite) => void handleSetupInviteResend(invite)}
                    onRevoke={(invite) => void handleSetupInviteRevoke(invite)}
                    onCopyFreshLink={(invite) => void handleSetupCopyFreshInviteLink(invite)}
                  />
                )}
              </div>
            </section>
          ) : null}

          <DashboardActionCenter
            actions={dashboardActionItems}
            deadlines={buildDashboardDeadlineCards(dashboard)}
            changeItems={buildDashboardChangeItems(dashboard)}
            setupChecklist={dashboard.setupChecklist}
            hasFounderSetupSection={dashboard.viewer.leagueRole === "COMMISSIONER" && (founderSetupLoading || Boolean(founderSetupError) || !founderSetup || !founderSetup.isComplete)}
            actionQueueTestId={
              dashboard.viewer.leagueRole === "MEMBER" && dashboard.viewer.hasTeamAccess
                ? "owner-action-queue"
                : dashboard.viewer.leagueRole === "COMMISSIONER"
                  ? "commissioner-action-queue"
                  : undefined
            }
            onActionSelect={(actionId, source) => recordDashboardAction(actionId, source)}
          />

          <GlobalAlertStrip
            alerts={visibleAlerts}
            testId="league-landing-alert-strip"
            itemTestIdPrefix="league-landing-alert"
          />

          {!prioritizeSetup && (
            <DashboardHealthSummaryRow
              items={buildDashboardHealthItems({ dashboard, draftsHome, tradesHome })}
              testId="dashboard-health-summary-row"
            />
          )}

          {!prioritizeSetup && (
            <section className="space-y-4" data-testid="dashboard-secondary-zone">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-600">Secondary Context</p>
                <h2 className="mt-1 text-lg font-medium text-slate-200">Reference surfaces after priority actions</h2>
                <p className="mt-1 text-sm text-slate-400" data-testid="dashboard-secondary-priority-copy">
                  Recommended next: {secondaryRecommendationLabel}
                </p>
              </div>

            <div 
              className="rounded-xl border border-slate-800/40 bg-slate-900/20 p-6 space-y-6" 
              data-testid="dashboard-secondary-cards"
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <div className={`space-y-3 ${prioritizeSecondaryActivity ? "order-2" : "order-1"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Picks & Draft</p>
                      <h3 className="mt-1 text-base font-medium text-slate-100">Rookie Picks Owned</h3>
                      <p className="mt-1 text-sm text-slate-400">Owned future rookie picks for the active window.</p>
                    </div>
                    {!prioritizeSecondaryActivity ? (
                      <span
                        className="rounded-full border border-sky-700/40 bg-sky-950/30 px-2 py-1 text-[11px] text-sky-200"
                        data-testid="dashboard-secondary-recommended-draft"
                      >
                        Recommended next
                      </span>
                    ) : null}
                    <Link
                      href="/draft"
                      className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600"
                      onClick={() => recordDashboardAction("draft-home", "secondary-zone")}
                    >
                      Open Picks & Draft
                    </Link>
                  </div>
                  <div className="mt-4">
                    {dashboard.rookiePicksOwned && dashboard.rookiePicksOwned.seasons.length > 0 ? (
                      <div className="space-y-3">
                        {dashboard.rookiePicksOwned.seasons.map((seasonBucket) => (
                          <div key={seasonBucket.seasonYear} className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-slate-100">{seasonBucket.seasonYear}</p>
                              <span className="text-xs text-slate-400">{seasonBucket.totalCount} pick(s)</span>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {seasonBucket.rounds.map((roundBucket) => (
                                <div
                                  key={`${seasonBucket.seasonYear}-${roundBucket.round}`}
                                  className="rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2"
                                >
                                  <p className="text-[11px] uppercase tracking-wide text-slate-500">Round {roundBucket.round}</p>
                                  <p className="mt-1 text-sm text-slate-200">
                                    {roundBucket.picks
                                      .map((pick) => pick.originalTeam.abbreviation ?? pick.originalTeam.name)
                                      .join(", ")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : dashboard.rookiePicksOwned ? (
                      <p className="text-sm text-slate-400">
                        No unused rookie picks are owned in the current dashboard window.
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">
                        Rookie pick ownership appears once the viewer resolves to an active franchise.
                      </p>
                    )}
                  </div>
                </div>

                <div className={`space-y-3 ${prioritizeSecondaryActivity ? "order-1" : "order-2"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">League Activity</p>
                      <h3 className="mt-1 text-base font-medium text-slate-100">League Activity / Commissioner Notes</h3>
                      <p className="mt-1 text-sm text-slate-400">Recent transactions plus the latest commissioner note for your current scope.</p>
                    </div>
                    {prioritizeSecondaryActivity ? (
                      <span
                        className="rounded-full border border-sky-700/40 bg-sky-950/30 px-2 py-1 text-[11px] text-sky-200"
                        data-testid="dashboard-secondary-recommended-activity"
                      >
                        Recommended next
                      </span>
                    ) : null}
                    <Link
                      href="/activity"
                      className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600"
                      onClick={() => recordDashboardAction("league-activity", "secondary-zone")}
                    >
                      Open League Activity
                    </Link>
                  </div>
                  <div className="mt-4">
                    <div className="space-y-4">
                      {dashboard.activitySummary.commissionerNote ? (
                        <div className="rounded-lg border border-sky-800/30 bg-sky-950/10 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-sky-400">Commissioner Note</p>
                          <p className="mt-2 text-sm text-slate-100">{dashboard.activitySummary.commissionerNote.reason}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatDateTime(dashboard.activitySummary.commissionerNote.createdAt)}
                            {dashboard.activitySummary.commissionerNote.actorName
                              ? ` · ${dashboard.activitySummary.commissionerNote.actorName}`
                              : ""}
                          </p>
                        </div>
                      ) : null}

                      {dashboard.activitySummary.recentActivity.length > 0 ? (
                        <div className="space-y-2">
                          {dashboard.activitySummary.recentActivity.map((activity) => (
                            <div key={activity.id} className="rounded-lg border border-slate-700/40 bg-slate-800/20 p-3">
                              <p className="text-sm font-medium text-slate-100">{activity.summary}</p>
                              <p className="mt-1 text-xs text-slate-400">
                                {formatDateTime(activity.createdAt)}
                                {activity.team ? ` · ${activity.team.name}` : ""}
                                {activity.player ? ` · ${activity.player.name}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-400">
                          {dashboard.activitySummary.emptyStateReason ?? "No recent activity is available."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          )}
        </div>
      ) : null}
    </div>
  );
}
