"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CommissionerQueueWorkspace } from "@/components/commissioner/commissioner-queue-workspace";
import {
  WeeklyWorkflowChecklist,
  type WeeklyWorkflowItem,
} from "@/components/commissioner/weekly-workflow-checklist";
import {
  InviteManagementPanel,
  type CommissionerInviteRow,
} from "@/components/commissioner/invite-management-panel";
import { requestJson } from "@/lib/client-request";
import {
  RemediationRecord,
  deriveRemediationStatus,
} from "@/lib/compliance/remediation";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { LeagueSummaryPayload } from "@/types/league";
import { SnapshotPreviewReceipt, SnapshotRestoreImpactSummary } from "@/types/snapshot";
import type { TradeHomeResponse } from "@/types/trade-workflow";

type LeaguePayload = LeagueSummaryPayload;

type TeamPayload = {
  teams: {
    id: string;
    name: string;
    complianceStatus: "ok" | "warning" | "error";
  }[];
};

type TransactionPayload = {
  transactions: {
    id: string;
    type: string;
    summary: string;
    createdAt: string;
    team: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
  }[];
};

type TradeOperationsPayload = Pick<TradeHomeResponse, "summary" | "sections">;

type CommissionerDisputeItem = {
  id: string;
  type: "compliance" | "trade";
  severity: "high" | "medium";
  title: string;
  summary: string;
  dueAt: string;
};

type CommissionerRulingRecord = {
  id: string;
  disputeId: string;
  disputeTitle: string;
  decision: "approve" | "deny" | "manual-review";
  ruleCitation: string;
  dueAt: string;
  notes: string;
  actorEmail: string;
  publishedAt: string;
};

type ComplianceQueuePayload = {
  queue: {
    remediationRecords: RemediationRecord[];
  };
};

type OverrideHistoryPayload = {
  history: {
    overrides: {
      id: string;
      teamId: string | null;
      issueId: string | null;
      overrideType: string;
      reason: string;
      entityType: string;
      entityId: string;
      metadata: {
        disputeId?: string;
        disputeTitle?: string;
        disputeType?: "compliance" | "trade";
        decision?: CommissionerRulingRecord["decision"];
        ruleCitation?: string;
        dueAt?: string;
        notes?: string;
      } | null;
      createdAt: string;
      actorUser: {
        email: string;
      } | null;
    }[];
  };
};

type LeagueWorkspace = {
  id: string;
  name: string;
  description: string | null;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  season: {
    id: string;
    year: number;
    phase: LeaguePayload["season"]["phase"];
  } | null;
  counts: {
    teams: number;
    memberships: number;
  };
  createdAt: string;
};

type LeagueWorkspaceListPayload = {
  leagues: LeagueWorkspace[];
};

function formatLeagueMembershipContext(workspace: Pick<LeagueWorkspace, "leagueRole" | "teamName">) {
  if (workspace.leagueRole === "COMMISSIONER") {
    return workspace.teamName ? `Commissioner · Team: ${workspace.teamName}` : "Commissioner";
  }
  return workspace.teamName ? `Member · Team: ${workspace.teamName}` : "Member";
}

type ComplianceScanPayload = {
  report: {
    summary: {
      teamsEvaluated: number;
      ok: number;
      warning: number;
      error: number;
      totalFindings: number;
    };
  };
};

type RolloverPayload = {
  rollover: {
    dryRun: boolean;
    sourceSeason: {
      id: string;
      year: number;
      phase: string;
    };
    targetSeason: {
      id: string | null;
      year: number;
      phase: string;
      created: boolean;
    };
    counts: {
      contractsEvaluated: number;
      carriedContracts: number;
      expiredContracts: number;
      skippedExistingContracts: number;
      carriedRosterSlots: number;
      skippedExistingRosterSlots: number;
    };
  };
};

type EmergencyFixPayload = {
  fix: {
    team: {
      id: string;
      name: string;
    };
    dryRun: boolean;
    policy: {
      targetRosterMax: number;
      targetCapType: "soft" | "hard" | "custom";
      targetCapValue: number;
    };
    before: {
      rosterCount: number;
      totalCapHit: number;
    };
    after: {
      rosterCount: number;
      totalCapHit: number;
    };
    droppedPlayers: {
      playerId: string;
      name: string;
      position: string;
      salary: number;
      rosterSlotsRemoved: number;
    }[];
    unresolved: {
      rosterExcess: number;
      capOverage: number;
      hasUnresolved: boolean;
    };
  };
};

type SnapshotExportPayload = {
  snapshot: Record<string, unknown>;
  counts: {
    leagues: number;
    seasons: number;
    rulesets: number;
    owners: number;
    teams: number;
    players: number;
    rosterSlots: number;
    contracts: number;
    capPenalties: number;
    futurePicks: number;
    drafts: number;
    draftSelections: number;
    trades: number;
    tradeAssets: number;
    transactions: number;
  };
};

type SnapshotImportPayload = {
  mode: "preview" | "apply";
  replaceExisting: boolean;
  counts: SnapshotExportPayload["counts"];
  preview?: SnapshotPreviewReceipt;
  impact?: SnapshotRestoreImpactSummary;
  findings: {
    code: string;
    message: string;
    path?: string;
  }[];
  applied?: boolean;
};

const PHASES: LeaguePayload["season"]["phase"][] = [
  "PRESEASON",
  "REGULAR_SEASON",
  "PLAYOFFS",
  "OFFSEASON",
];
const ROLLOVER_CONFIRM_TEXT = "RUN ROLLOVER";
const FIX_CONFIRM_TEXT = "APPLY FIX";
const SNAPSHOT_CONFIRM_TEXT = "APPLY RESTORE";
const SNAPSHOT_IMPACT_KEYS = [
  "teams",
  "players",
  "rosterSlots",
  "contracts",
  "futurePicks",
  "transactions",
] as const;

const WEEKLY_CHECKLIST_ITEMS: WeeklyWorkflowItem[] = [
  {
    id: "phase-review",
    title: "Confirm active phase and weekly transition window",
    description:
      "Validate the league is operating in the expected season phase before running weekly actions.",
  },
  {
    id: "compliance-scan",
    title: "Run league compliance scan and review blockers",
    description:
      "Surface roster and cap violations before trades and waiver processing are finalized.",
  },
  {
    id: "trade-approval-queue",
    title: "Review flagged trade proposals awaiting commissioner decision",
    description: "Clear the review queue so owners know which trade proposals can advance this week.",
    href: "/trades?from=workflow&step=trade-approval-queue",
    ctaLabel: "Open Trades",
  },
  {
    id: "trade-processing-queue",
    title: "Settle approved trade proposals",
    description:
      "Complete proposal settlement so player and pick ownership stay current before lineups lock.",
    href: "/trades?from=workflow&step=trade-processing-queue",
    ctaLabel: "Open Settlement Queue",
  },
  {
    id: "audit-health-check",
    title: "Review commissioner audit activity",
    description:
      "Check recent operational records across lifecycle, compliance, trades, drafts, auctions, and sync.",
    href: "/commissioner/audit",
    ctaLabel: "Open Audit",
  },
];

function getIsoWeekBucket(date: Date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function formatSignedValue(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function toCommissionerRulingRecord(
  override: OverrideHistoryPayload["history"]["overrides"][number],
): CommissionerRulingRecord | null {
  if (override.overrideType !== "MANUAL_RULING") {
    return null;
  }

  const metadata = override.metadata ?? {};
  const disputeId = typeof metadata.disputeId === "string" ? metadata.disputeId : override.entityId;
  const disputeTitle =
    typeof metadata.disputeTitle === "string" && metadata.disputeTitle.trim().length > 0
      ? metadata.disputeTitle
      : `${override.entityType} ${override.entityId}`;
  const dueAt =
    typeof metadata.dueAt === "string" && metadata.dueAt.trim().length > 0
      ? metadata.dueAt
      : override.createdAt;
  const decision =
    metadata.decision === "approve" || metadata.decision === "deny" || metadata.decision === "manual-review"
      ? metadata.decision
      : "manual-review";
  const ruleCitation =
    typeof metadata.ruleCitation === "string" && metadata.ruleCitation.trim().length > 0
      ? metadata.ruleCitation
      : "RULE-MANUAL-001";

  return {
    id: override.id,
    disputeId,
    disputeTitle,
    decision,
    ruleCitation,
    dueAt,
    notes:
      typeof metadata.notes === "string" && metadata.notes.trim().length > 0
        ? metadata.notes
        : override.reason,
    actorEmail: override.actorUser?.email ?? "commissioner@local.league",
    publishedAt: override.createdAt,
  };
}

type FixFormState = {
  teamId: string;
  targetRosterMax: string;
  targetCapType: "soft" | "hard" | "custom";
  targetCapValue: string;
};

type LeagueSettingsFormState = {
  name: string;
  description: string;
  regularSeasonWeeks: string;
  playoffStartWeek: string;
  playoffEndWeek: string;
};

type LeagueWorkspaceCreateFormState = {
  name: string;
  description: string;
  seasonYear: string;
};

type LeagueInviteFormState = {
  ownerName: string;
  ownerEmail: string;
  teamName: string;
  teamAbbreviation: string;
  divisionLabel: string;
};

type LeagueInvitesPayload = {
  invites: CommissionerInviteRow[];
  capabilities: {
    copyFreshLink: boolean;
  };
};

type EmailDeliveryPayload = {
  state: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown";
  label: string;
  detail: string;
  attemptedAt: string | null;
  canRetry: boolean;
  inviteStillValid: boolean;
};

type SnapshotImportApiError = {
  message: string;
  findings: SnapshotImportPayload["findings"];
};

function joinStatusMessage(base: string, followUp: string | null) {
  return followUp ? `${base} ${followUp}` : base;
}

function buildInviteDeliveryFollowUp(
  delivery: EmailDeliveryPayload | null | undefined,
  options: {
    copiedFreshLink?: boolean;
  } = {},
) {
  if (!delivery) {
    return null;
  }

  if (options.copiedFreshLink && (delivery.state === "failed" || delivery.state === "not_configured")) {
    return "Use the copied link directly while outbound email delivery is unavailable.";
  }

  return delivery.detail;
}

function OperationsSectionShell(props: {
  id: string;
  title: string;
  description: string;
  summary: string;
  testId: string;
  defaultOpen?: boolean;
  tone?: "default" | "warning" | "danger";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  const toneClasses =
    props.tone === "danger"
      ? "border-red-700/60 bg-red-950/15"
      : props.tone === "warning"
        ? "border-amber-800/40 bg-amber-950/10"
        : "border-slate-800/80 bg-slate-950/30";

  return (
    <section
      id={props.id}
      data-testid={props.testId}
      className={`scroll-mt-24 rounded-lg border p-4 ${toneClasses}`}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
        data-testid={`${props.testId}-toggle`}
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{props.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{props.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
            {props.summary}
          </span>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
            {open ? "Collapse" : "Expand"}
          </span>
        </div>
      </button>
      {open ? <div className="mt-4 space-y-4">{props.children}</div> : null}
    </section>
  );
}

function parseJsonMaybe(input: string): unknown {
  if (!input.trim()) {
    return {};
  }

  try {
    return JSON.parse(input);
  } catch {
    return { message: input.slice(0, 250) };
  }
}

async function postSnapshotImport(
  body: Record<string, unknown>,
): Promise<{ ok: true; payload: SnapshotImportPayload } | { ok: false; error: SnapshotImportApiError }> {
  const response = await fetch("/api/commissioner/snapshot/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  const payload = parseJsonMaybe(raw);

  if (response.ok && payload && typeof payload === "object" && !("error" in payload)) {
    return { ok: true, payload: payload as SnapshotImportPayload };
  }

  const errorObject =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as {
          error?: {
            message?: string;
            context?: {
              findings?: SnapshotImportPayload["findings"];
            } | null;
          };
        }).error
      : null;

  return {
    ok: false,
    error: {
      message: errorObject?.message?.trim() || "Snapshot import request failed.",
      findings: Array.isArray(errorObject?.context?.findings) ? errorObject.context.findings : [],
    },
  };
}

export default function CommissionerPage() {
  const [league, setLeague] = useState<LeaguePayload | null>(null);
  const [leagueWorkspaces, setLeagueWorkspaces] = useState<LeagueWorkspace[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [teams, setTeams] = useState<TeamPayload["teams"]>([]);
  const [tradeOperations, setTradeOperations] = useState<TradeOperationsPayload | null>(null);
  const [transactions, setTransactions] = useState<TransactionPayload["transactions"]>([]);
  const [remediationEvidence, setRemediationEvidence] = useState<RemediationRecord[]>([]);
  const [complianceSummary, setComplianceSummary] =
    useState<ComplianceScanPayload["report"]["summary"] | null>(null);
  const [rolloverResult, setRolloverResult] = useState<RolloverPayload["rollover"] | null>(null);
  const [fixResult, setFixResult] = useState<EmergencyFixPayload["fix"] | null>(null);
  const [snapshotJson, setSnapshotJson] = useState("");
  const [snapshotPreview, setSnapshotPreview] = useState<SnapshotImportPayload | null>(null);
  const [snapshotValidationFindings, setSnapshotValidationFindings] =
    useState<SnapshotImportPayload["findings"]>([]);
  const [snapshotReplaceExisting, setSnapshotReplaceExisting] = useState(false);
  const [snapshotApplyConfirmation, setSnapshotApplyConfirmation] = useState("");
  const [lastSnapshotPreviewSource, setLastSnapshotPreviewSource] = useState<string | null>(null);
  const [rolloverApplyConfirmation, setRolloverApplyConfirmation] = useState("");
  const [rolloverApplyConfirmed, setRolloverApplyConfirmed] = useState(false);
  const [fixApplyConfirmation, setFixApplyConfirmation] = useState("");
  const [fixApplyConfirmed, setFixApplyConfirmed] = useState(false);
  const [lastFixPreviewSignature, setLastFixPreviewSignature] = useState<string | null>(null);
  const [weeklyChecklistState, setWeeklyChecklistState] = useState<Record<string, boolean>>({});
  const [lastScanRanAt, setLastScanRanAt] = useState<number | null>(null);
  const [rulings, setRulings] = useState<CommissionerRulingRecord[]>([]);
  const [selectedDisputeId, setSelectedDisputeId] = useState("");
  const [rulingDecision, setRulingDecision] = useState<CommissionerRulingRecord["decision"]>("manual-review");
  const [rulingCitation, setRulingCitation] = useState("RULE-TRADE-001");
  const [rulingNotes, setRulingNotes] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fixForm, setFixForm] = useState<FixFormState>({
    teamId: "",
    targetRosterMax: "",
    targetCapType: "soft",
    targetCapValue: "",
  });
  const [leagueSettingsForm, setLeagueSettingsForm] = useState<LeagueSettingsFormState>({
    name: "",
    description: "",
    regularSeasonWeeks: "",
    playoffStartWeek: "",
    playoffEndWeek: "",
  });
  const [leagueWorkspaceCreateForm, setLeagueWorkspaceCreateForm] = useState<LeagueWorkspaceCreateFormState>({
    name: "",
    description: "",
    seasonYear: String(new Date().getFullYear()),
  });
  const [leagueInviteForm, setLeagueInviteForm] = useState<LeagueInviteFormState>({
    ownerName: "",
    ownerEmail: "",
    teamName: "",
    teamAbbreviation: "",
    divisionLabel: "",
  });
  const [leagueInvites, setLeagueInvites] = useState<CommissionerInviteRow[]>([]);
  const [inviteCopyFreshLinkEnabled, setInviteCopyFreshLinkEnabled] = useState(false);

  async function loadComplianceOps() {
    const [queuePayload, overridesPayload] = await Promise.all([
      requestJson<ComplianceQueuePayload>("/api/commissioner/compliance/queue"),
      requestJson<OverrideHistoryPayload>("/api/commissioner/overrides"),
    ]);

    setRemediationEvidence(queuePayload.queue.remediationRecords);
    setRulings(
      overridesPayload.history.overrides
        .map((override) => toCommissionerRulingRecord(override))
        .filter((value): value is CommissionerRulingRecord => Boolean(value)),
    );
  }

  async function loadCore() {
    const [
      leaguePayload,
      teamsPayload,
      tradeOperationsPayload,
      transactionsPayload,
      workspacesPayload,
      invitesPayload,
    ] = await Promise.all([
      requestJson<LeaguePayload>("/api/league"),
      requestJson<TeamPayload>("/api/teams"),
      requestJson<TradeHomeResponse>("/api/trades/home"),
      requestJson<TransactionPayload>("/api/transactions?limit=40"),
      requestJson<LeagueWorkspaceListPayload>("/api/leagues"),
      requestJson<LeagueInvitesPayload>("/api/league/invites"),
      loadComplianceOps(),
    ]);

    setLeague(leaguePayload);
    setTeams(teamsPayload.teams);
    setTradeOperations({
      summary: tradeOperationsPayload.summary,
      sections: tradeOperationsPayload.sections,
    });
    setTransactions(transactionsPayload.transactions);
    setLeagueWorkspaces(workspacesPayload.leagues);
    setActiveLeagueId(leaguePayload.league.id);
    setLeagueInvites(invitesPayload.invites);
    setInviteCopyFreshLinkEnabled(invitesPayload.capabilities.copyFreshLink);

    setFixForm((previous) => ({
      ...previous,
      teamId: previous.teamId || teamsPayload.teams[0]?.id || "",
      targetRosterMax:
        previous.targetRosterMax || String(leaguePayload.ruleset.rosterSize),
    }));
    setLeagueSettingsForm({
      name: leaguePayload.league.name,
      description: leaguePayload.league.description ?? "",
      regularSeasonWeeks: String(leaguePayload.season.regularSeasonWeeks),
      playoffStartWeek: String(leaguePayload.season.playoffStartWeek),
      playoffEndWeek: String(leaguePayload.season.playoffEndWeek),
    });
  }

  async function loadTransactions() {
    const payload = await requestJson<TransactionPayload>("/api/transactions?limit=40");
    setTransactions(payload.transactions);
  }

  useEffect(() => {
    let mounted = true;

    loadCore()
      .catch((requestError) => {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load commissioner data.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const canSubmitFix = useMemo(() => {
    if (!fixForm.teamId) {
      return false;
    }

    if (!fixForm.targetRosterMax || Number.isNaN(Number(fixForm.targetRosterMax))) {
      return false;
    }

    if (fixForm.targetCapType === "custom") {
      return fixForm.targetCapValue.length > 0 && !Number.isNaN(Number(fixForm.targetCapValue));
    }

    return true;
  }, [fixForm]);

  const canCreateLeagueWorkspace = useMemo(() => {
    if (leagueWorkspaceCreateForm.name.trim().length < 2) {
      return false;
    }
    const seasonYear = Number(leagueWorkspaceCreateForm.seasonYear);
    return Number.isInteger(seasonYear) && seasonYear >= 2000 && seasonYear <= 2100;
  }, [leagueWorkspaceCreateForm.name, leagueWorkspaceCreateForm.seasonYear]);

  const canInviteLeagueMember = useMemo(
    () =>
      leagueInviteForm.ownerName.trim().length >= 2 &&
      leagueInviteForm.ownerEmail.trim().length >= 5 &&
      leagueInviteForm.teamName.trim().length >= 2,
    [leagueInviteForm.ownerEmail, leagueInviteForm.ownerName, leagueInviteForm.teamName],
  );

  const fixConfigSignature = useMemo(() => {
    const normalizedCapValue =
      fixForm.targetCapType === "custom"
        ? Number(fixForm.targetCapValue || 0)
        : fixForm.targetCapType === "hard"
          ? league?.ruleset.salaryCapHard ?? null
          : league?.ruleset.salaryCapSoft ?? null;

    return JSON.stringify({
      teamId: fixForm.teamId,
      targetRosterMax: Number(fixForm.targetRosterMax || 0),
      targetCapType: fixForm.targetCapType,
      targetCapValue: normalizedCapValue,
    });
  }, [
    fixForm.targetCapType,
    fixForm.targetCapValue,
    fixForm.targetRosterMax,
    fixForm.teamId,
    league?.ruleset.salaryCapHard,
    league?.ruleset.salaryCapSoft,
  ]);

  const hasRolloverPreview = rolloverResult?.dryRun === true;
  const canApplyRollover =
    hasRolloverPreview &&
    rolloverApplyConfirmed &&
    rolloverApplyConfirmation.trim().toUpperCase() === ROLLOVER_CONFIRM_TEXT;

  const hasFixPreviewForCurrentConfig =
    fixResult?.dryRun === true && lastFixPreviewSignature === fixConfigSignature;
  const canApplyFix =
    hasFixPreviewForCurrentConfig &&
    fixApplyConfirmed &&
    fixApplyConfirmation.trim().toUpperCase() === FIX_CONFIRM_TEXT;

  const hasSnapshotPreviewForCurrentJson =
    snapshotPreview?.mode === "preview" && lastSnapshotPreviewSource === snapshotJson;
  const snapshotConfirmationPhrase = snapshotPreview?.preview?.confirmationPhrase ?? SNAPSHOT_CONFIRM_TEXT;
  const canApplySnapshotRestore =
    hasSnapshotPreviewForCurrentJson &&
    snapshotReplaceExisting &&
    snapshotApplyConfirmation.trim().toUpperCase() === snapshotConfirmationPhrase;
  const snapshotImpact = snapshotPreview?.impact ?? null;
  const checklistStorageKey = useMemo(
    () =>
      `dynasty:commissioner-weekly-checklist:v1:${league?.season.year ?? "unknown"}:${getIsoWeekBucket(new Date())}`,
    [league?.season.year],
  );
  const checklistCompletedCount = useMemo(
    () =>
      WEEKLY_CHECKLIST_ITEMS.filter((item) => weeklyChecklistState[item.id]).length,
    [weeklyChecklistState],
  );
  const disputeQueue = useMemo<CommissionerDisputeItem[]>(() => {
    const complianceItems: CommissionerDisputeItem[] = teams
      .filter((team) => team.complianceStatus === "error" || team.complianceStatus === "warning")
      .map((team) => ({
        id: `compliance:${team.id}`,
        type: "compliance",
        severity: team.complianceStatus === "error" ? "high" : "medium",
        title: `${team.name} compliance remediation`,
        summary:
          team.complianceStatus === "error"
            ? "Hard compliance blocker requires immediate commissioner ruling."
            : "Warning-level compliance issue needs policy decision.",
        dueAt: new Date(Date.now() + (team.complianceStatus === "error" ? 8 : 24) * 3_600_000).toISOString(),
      }));

    const tradeItems: CommissionerDisputeItem[] = (tradeOperations?.sections.reviewQueue ?? []).map(
      (proposal) => ({
        id: `trade:${proposal.id}`,
        type: "trade",
        severity: proposal.reviewRequired ? "high" : "medium",
        title: `${proposal.proposerTeam.name} vs ${proposal.counterpartyTeam.name}`,
        summary: "Flagged trade proposal awaiting commissioner review.",
        dueAt: new Date(
          new Date(proposal.submittedAt ?? proposal.updatedAt).getTime() + 48 * 3_600_000,
        ).toISOString(),
      }),
    );

    return [...complianceItems, ...tradeItems].sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === "high" ? -1 : 1;
      }
      return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
    });
  }, [teams, tradeOperations?.sections.reviewQueue]);
  const settlementQueue = tradeOperations?.sections.settlementQueue ?? [];
  const selectedDispute = useMemo(
    () => disputeQueue.find((item) => item.id === selectedDisputeId) ?? null,
    [disputeQueue, selectedDisputeId],
  );
  const remediationEvidenceRows = useMemo(() => {
    return remediationEvidence
      .map((record) => ({
        ...record,
        status: deriveRemediationStatus(record),
      }))
      .sort((left, right) => {
        const statusRank = left.status === "Pending review" ? 0 : left.status === "In Progress" ? 1 : 2;
        const rightStatusRank =
          right.status === "Pending review" ? 0 : right.status === "In Progress" ? 1 : 2;
        if (statusRank !== rightStatusRank) {
          return statusRank - rightStatusRank;
        }
        if (left.severity !== right.severity) {
          return left.severity === "error" ? -1 : 1;
        }
        return new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      });
  }, [remediationEvidence]);
  const compliancePriorityCount = useMemo(
    () => teams.filter((team) => team.complianceStatus !== "ok").length,
    [teams],
  );
  const blockingComplianceCount = useMemo(
    () => teams.filter((team) => team.complianceStatus === "error").length,
    [teams],
  );
  const tradeReviewCount = useMemo(
    () => disputeQueue.filter((item) => item.type === "trade").length,
    [disputeQueue],
  );
  const tradeSettlementCount = settlementQueue.length;
  const weeklyChecklistSystemValidation = useMemo(() => {
    const phaseLabels: Record<string, string> = {
      PRESEASON: "Preseason",
      REGULAR_SEASON: "Regular Season",
      PLAYOFFS: "Playoffs",
      OFFSEASON: "Offseason",
    };
    const phaseLabel = league?.season.phase ? (phaseLabels[league.season.phase] ?? league.season.phase) : null;

    return {
      "phase-review": {
        validated: false,
        blocked: false,
        reason: "",
        confirmLabel: phaseLabel
          ? `Confirm: ${phaseLabel} phase is active`
          : "Confirm phase is active",
      },
      "compliance-scan": {
        validated: lastScanRanAt !== null,
        blocked: false,
        reason: lastScanRanAt !== null ? "Scan completed this session" : "Scan not yet run",
      },
      "trade-approval-queue": {
        validated: tradeReviewCount === 0,
        blocked: tradeReviewCount > 0,
        reason: tradeReviewCount === 0
          ? "Review queue is clear"
          : `${tradeReviewCount} proposal${tradeReviewCount === 1 ? "" : "s"} pending review`,
      },
      "trade-processing-queue": {
        validated: tradeSettlementCount === 0,
        blocked: tradeSettlementCount > 0,
        reason: tradeSettlementCount === 0
          ? "Settlement queue is clear"
          : `${tradeSettlementCount} trade${tradeSettlementCount === 1 ? "" : "s"} pending settlement`,
      },
      "audit-health-check": {
        validated: false,
        blocked: false,
        reason: "",
        confirmLabel: "Confirm audit reviewed",
      },
    };
  }, [lastScanRanAt, tradeReviewCount, tradeSettlementCount, league?.season.phase]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(checklistStorageKey);
      if (!raw) {
        setWeeklyChecklistState({});
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        setWeeklyChecklistState(parsed as Record<string, boolean>);
        return;
      }
    } catch {
      // Ignore malformed local storage snapshots and reset to default.
    }

    setWeeklyChecklistState({});
  }, [checklistStorageKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(checklistStorageKey, JSON.stringify(weeklyChecklistState));
  }, [checklistStorageKey, weeklyChecklistState]);

  useEffect(() => {
    if (!selectedDisputeId && disputeQueue.length > 0) {
      setSelectedDisputeId(disputeQueue[0].id);
    }
  }, [disputeQueue, selectedDisputeId]);

  function toggleWeeklyChecklistItem(itemId: string) {
    setWeeklyChecklistState((previous) => ({
      ...previous,
      [itemId]: !previous[itemId],
    }));
  }

  function publishRuling() {
    if (!selectedDisputeId) {
      setError("Select a dispute before publishing a ruling.");
      return;
    }

    const dispute = disputeQueue.find((item) => item.id === selectedDisputeId);
    if (!dispute) {
      setError("Selected dispute no longer exists in queue.");
      return;
    }

    if (!rulingCitation.trim()) {
      setError("Rule citation is required.");
      return;
    }

    const normalizedNotes = rulingNotes.trim() || "No additional notes provided.";
    setBusyAction("ruling:publish");
    setError(null);
    setMessage(null);

    requestJson<{ override: { id: string } }>("/api/commissioner/overrides", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId:
          dispute.type === "compliance" && dispute.id.startsWith("compliance:")
            ? dispute.id.slice("compliance:".length)
            : null,
        overrideType: "MANUAL_RULING",
        reason: `${rulingCitation.trim()}: ${normalizedNotes}`,
        entityType: dispute.type,
        entityId: dispute.id,
        metadata: {
          disputeId: dispute.id,
          disputeTitle: dispute.title,
          disputeType: dispute.type,
          decision: rulingDecision,
          ruleCitation: rulingCitation.trim(),
          dueAt: dispute.dueAt,
          notes: normalizedNotes,
        },
      }),
    }, "Failed to publish ruling.")
      .then(async () => {
        await loadComplianceOps();
        setRulingNotes("");
        setMessage("Ruling published with policy citation and due-date context.");
      })
      .catch((requestError) => {
        setError(requestError instanceof Error ? requestError.message : "Failed to publish ruling.");
      })
      .finally(() => {
        setBusyAction(null);
      });
  }

  async function runPhaseTransition(nextPhase: LeaguePayload["season"]["phase"]) {
    const reason = window.prompt("Enter a reason for this phase transition.", "Weekly phase transition");
    if (reason === null) {
      return;
    }

    setBusyAction(`phase:${nextPhase}`);
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<{
        season: LeaguePayload["season"];
      }>("/api/commissioner/season/phase", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phase: nextPhase, reason }),
      });

      setLeague((previous) =>
        previous
          ? {
              ...previous,
              season: payload.season,
            }
          : previous,
      );

      await loadTransactions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update phase.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runComplianceScan() {
    setBusyAction("compliance");
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<ComplianceScanPayload>("/api/commissioner/compliance/run", {
        method: "POST",
      });
      setComplianceSummary(payload.report.summary);
      setLastScanRanAt(Date.now());
      await loadComplianceOps();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to run compliance scan.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runRollover(dryRun: boolean) {
    if (!dryRun) {
      if (!hasRolloverPreview) {
        setError("Run rollover preview before applying offseason rollover.");
        return;
      }
      if (!canApplyRollover) {
        setError("Complete rollover danger-zone confirmations before apply.");
        return;
      }
    }

    if (!dryRun) {
      const confirmed = window.confirm(
        "Apply offseason rollover now? This will mutate season and contract state.",
      );
      if (!confirmed) {
        return;
      }
    }

    setBusyAction(dryRun ? "rollover:preview" : "rollover:run");
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<RolloverPayload>("/api/commissioner/rollover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });

      setRolloverResult(payload.rollover);
      if (dryRun) {
        setRolloverApplyConfirmed(false);
        setRolloverApplyConfirmation("");
        setMessage("Rollover preview complete. Apply is now available in Danger Zone.");
      } else {
        setRolloverApplyConfirmed(false);
        setRolloverApplyConfirmation("");
        setMessage("Offseason rollover applied.");
      }
      await loadCore();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to run rollover.");
    } finally {
      setBusyAction(null);
    }
  }

  async function runEmergencyFix(dryRun: boolean) {
    if (!canSubmitFix) {
      return;
    }

    if (!dryRun) {
      if (!hasFixPreviewForCurrentConfig) {
        setError("Run emergency fix dry run for current settings before apply.");
        return;
      }
      if (!canApplyFix) {
        setError("Complete emergency fix danger-zone confirmations before apply.");
        return;
      }
    }

    if (!dryRun) {
      const confirmed = window.confirm(
        "Apply emergency team fix now? This may drop players and alter cap state.",
      );
      if (!confirmed) {
        return;
      }
    }

    const reason =
      dryRun
        ? null
        : window.prompt(
            "Enter a reason for this emergency fix.",
            "Commissioner emergency compliance remediation",
          );
    if (!dryRun && reason === null) {
      return;
    }

    setBusyAction(dryRun ? "fix:preview" : "fix:apply");
    setError(null);
    setMessage(null);

    const body: {
      teamId: string;
      targetRosterMax: number;
      targetCapType: "soft" | "hard";
      targetCapValue?: number;
      dryRun: boolean;
    } = {
      teamId: fixForm.teamId,
      targetRosterMax: Number(fixForm.targetRosterMax),
      targetCapType: fixForm.targetCapType === "hard" ? "hard" : "soft",
      dryRun,
    };

    if (fixForm.targetCapType === "custom") {
      body.targetCapValue = Number(fixForm.targetCapValue);
      body.targetCapType = "soft";
    } else {
      delete body.targetCapValue;
    }

    try {
      const payload = await requestJson<EmergencyFixPayload>("/api/commissioner/override/fix-team", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...body,
          ...(reason ? { reason } : {}),
        }),
      });

      setFixResult(payload.fix);
      if (dryRun) {
        setLastFixPreviewSignature(fixConfigSignature);
        setFixApplyConfirmed(false);
        setFixApplyConfirmation("");
        setMessage("Emergency fix dry run complete. Apply is now available in Danger Zone.");
      } else {
        setLastFixPreviewSignature(null);
        setFixApplyConfirmed(false);
        setFixApplyConfirmation("");
        setMessage("Emergency team fix applied.");
      }
      await loadCore();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to run emergency fix.");
    } finally {
      setBusyAction(null);
    }
  }

  async function exportSnapshot() {
    setBusyAction("snapshot:export");
    setError(null);
    setMessage(null);
    setSnapshotValidationFindings([]);
    try {
      const payload = await requestJson<SnapshotExportPayload>(
        "/api/commissioner/snapshot/export?pretty=true",
      );
      setSnapshotJson(JSON.stringify(payload.snapshot, null, 2));
      setLastSnapshotPreviewSource(null);
      setSnapshotReplaceExisting(false);
      setSnapshotApplyConfirmation("");
      setSnapshotPreview({
        mode: "preview",
        replaceExisting: false,
        counts: payload.counts,
        preview: undefined,
        impact: undefined,
        findings: [],
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Failed to export snapshot.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function previewSnapshotImport() {
    if (!snapshotJson.trim()) {
      setSnapshotValidationFindings([]);
      setError("Snapshot JSON is required before preview.");
      return;
    }

    let parsedSnapshot: unknown;
    try {
      parsedSnapshot = JSON.parse(snapshotJson);
    } catch {
      setSnapshotValidationFindings([]);
      setError("Snapshot JSON is invalid. Fix JSON syntax and retry.");
      return;
    }

    setBusyAction("snapshot:preview");
    setError(null);
    setMessage(null);
    try {
      const result = await postSnapshotImport({
        mode: "preview",
        snapshot: parsedSnapshot,
      });
      if (!result.ok) {
        setSnapshotValidationFindings(result.error.findings);
        setSnapshotPreview(null);
        setLastSnapshotPreviewSource(null);
        setError(result.error.message);
        return;
      }

      const payload = result.payload;
      setSnapshotValidationFindings(payload.findings);
      setSnapshotPreview(payload);
      setLastSnapshotPreviewSource(snapshotJson);
      setSnapshotReplaceExisting(false);
      setSnapshotApplyConfirmation("");
      setMessage("Snapshot preview complete. Restore apply is now available in Danger Zone.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to preview snapshot import.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function applySnapshotImport() {
    if (!snapshotJson.trim()) {
      setSnapshotValidationFindings([]);
      setError("Snapshot JSON is required before apply.");
      return;
    }
    if (!hasSnapshotPreviewForCurrentJson) {
      setError("Run snapshot preview for the current JSON before apply.");
      return;
    }
    if (!canApplySnapshotRestore) {
      setError("Complete snapshot danger-zone confirmations before apply.");
      return;
    }
    const previewHash = snapshotPreview?.preview?.snapshotHash;
    if (!previewHash) {
      setError("Run snapshot preview for the current JSON before apply.");
      return;
    }

    let parsedSnapshot: unknown;
    try {
      parsedSnapshot = JSON.parse(snapshotJson);
    } catch {
      setSnapshotValidationFindings([]);
      setError("Snapshot JSON is invalid. Fix JSON syntax and retry.");
      return;
    }

    const confirmed = window.confirm(
      "Apply snapshot restore? This replaces current local league data.",
    );
    if (!confirmed) {
      return;
    }

    setBusyAction("snapshot:apply");
    setError(null);
    setMessage(null);
    try {
      const result = await postSnapshotImport({
        mode: "apply",
        replaceExisting: true,
        previewHash,
        snapshot: parsedSnapshot,
      });
      if (!result.ok) {
        setSnapshotValidationFindings(result.error.findings);
        setError(result.error.message);
        return;
      }

      const payload = result.payload;
      setSnapshotValidationFindings(payload.findings);
      setSnapshotPreview(payload);
      setSnapshotReplaceExisting(false);
      setSnapshotApplyConfirmation("");
      setLastSnapshotPreviewSource(null);
      setMessage("Snapshot restore applied.");
      await loadCore();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to apply snapshot import.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function saveLeagueSettings() {
    setBusyAction("league:save");
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<LeaguePayload>(
        "/api/league",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: leagueSettingsForm.name,
            description: leagueSettingsForm.description,
            regularSeasonWeeks: Number(leagueSettingsForm.regularSeasonWeeks),
            playoffStartWeek: Number(leagueSettingsForm.playoffStartWeek),
            playoffEndWeek: Number(leagueSettingsForm.playoffEndWeek),
          }),
        },
        "Failed to update league settings.",
      );

      setLeague(payload);
      setLeagueSettingsForm({
        name: payload.league.name,
        description: payload.league.description ?? "",
        regularSeasonWeeks: String(payload.season.regularSeasonWeeks),
        playoffStartWeek: String(payload.season.playoffStartWeek),
        playoffEndWeek: String(payload.season.playoffEndWeek),
      });
      setMessage("League settings updated.");
      await loadTransactions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update league settings.");
    } finally {
      setBusyAction(null);
    }
  }

  async function switchActiveLeagueWorkspace(leagueId: string) {
    if (!leagueId || leagueId === activeLeagueId) {
      return;
    }

    setBusyAction("workspace:switch");
    setError(null);
    setMessage(null);
    try {
      const payload = await requestJson<{
        league: { id: string; name: string };
      }>(
        "/api/league/context",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ leagueId }),
        },
        "Failed to switch active league workspace.",
      );

      setActiveLeagueId(payload.league.id);
      await loadCore();
      setMessage(`Active workspace switched to ${payload.league.name}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Failed to switch active league workspace.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function createLeagueWorkspace() {
    if (!canCreateLeagueWorkspace) {
      return;
    }

    setBusyAction("workspace:create");
    setError(null);
    setMessage(null);
    try {
      const payload = await requestJson<{
        league: { id: string; name: string };
      }>(
        "/api/leagues",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: leagueWorkspaceCreateForm.name.trim(),
            description: leagueWorkspaceCreateForm.description.trim(),
            seasonYear: Number(leagueWorkspaceCreateForm.seasonYear),
          }),
        },
        "Failed to create league workspace.",
      );

      setActiveLeagueId(payload.league.id);
      setLeagueWorkspaceCreateForm({
        name: "",
        description: "",
        seasonYear: String(new Date().getFullYear()),
      });
      await loadCore();
      setMessage(`Created and switched to league workspace ${payload.league.name}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create league workspace.");
    } finally {
      setBusyAction(null);
    }
  }

  async function inviteLeagueMember() {
    if (!canInviteLeagueMember) {
      return;
    }

    setBusyAction("workspace:invite");
    setError(null);
    setMessage(null);
    try {
      const payload = await requestJson<{
        owner: { name: string };
        team: { name: string };
        delivery: EmailDeliveryPayload;
      }>(
        "/api/league/invites",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ownerName: leagueInviteForm.ownerName.trim(),
            ownerEmail: leagueInviteForm.ownerEmail.trim().toLowerCase(),
            teamName: leagueInviteForm.teamName.trim(),
            teamAbbreviation: leagueInviteForm.teamAbbreviation.trim(),
            divisionLabel: leagueInviteForm.divisionLabel.trim(),
          }),
        },
        "Failed to invite member.",
      );

      setLeagueInviteForm({
        ownerName: "",
        ownerEmail: "",
        teamName: "",
        teamAbbreviation: "",
        divisionLabel: leagueInviteForm.divisionLabel,
      });
      await loadCore();
      setMessage(
        joinStatusMessage(
          `Invited ${payload.owner.name} and added team ${payload.team.name}.`,
          buildInviteDeliveryFollowUp(payload.delivery),
        ),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to invite member.");
    } finally {
      setBusyAction(null);
    }
  }

  async function resendLeagueInvite(invite: CommissionerInviteRow) {
    setBusyAction(`invite:resend:${invite.id}`);
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<{
        invite: { id: string };
        delivery: EmailDeliveryPayload;
      }>(
        `/api/league/invites/${invite.id}/resend`,
        {
          method: "POST",
        },
        "Failed to resend invite.",
      );

      await loadCore();
      setMessage(
        joinStatusMessage(
          `Reissued invite to ${invite.email}. Previous active link is no longer valid.`,
          buildInviteDeliveryFollowUp(payload.delivery),
        ),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to resend invite.");
    } finally {
      setBusyAction(null);
    }
  }

  async function revokeLeagueInvite(invite: CommissionerInviteRow) {
    const confirmed = window.confirm(
      `Revoke the pending invite for ${invite.email}? They will need a new invite link to join this league.`,
    );
    if (!confirmed) {
      return;
    }

    setBusyAction(`invite:revoke:${invite.id}`);
    setError(null);
    setMessage(null);

    try {
      await requestJson<{ invite: { id: string } }>(
        `/api/league/invites/${invite.id}/revoke`,
        {
          method: "POST",
        },
        "Failed to revoke invite.",
      );

      await loadCore();
      setMessage(`Revoked invite for ${invite.email}.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to revoke invite.");
    } finally {
      setBusyAction(null);
    }
  }

  async function copyFreshInviteLink(invite: CommissionerInviteRow) {
    setBusyAction(`invite:copy:${invite.id}`);
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<{
        invite: { id: string };
        delivery: EmailDeliveryPayload;
        inviteUrl: string;
      }>(
        `/api/league/invites/${invite.id}/copy-link`,
        {
          method: "POST",
        },
        "Failed to copy invite link.",
      );

      let copiedToClipboard = false;
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload.inviteUrl);
        copiedToClipboard = true;
      } else {
        window.prompt("Copy the fresh invite link below.", payload.inviteUrl);
      }

      await loadCore();
      setMessage(
        joinStatusMessage(
          copiedToClipboard
            ? `Copied a fresh invite link for ${invite.email}. Previous active link is no longer valid.`
            : `Generated a fresh invite link for ${invite.email}. Previous active link is no longer valid.`,
          buildInviteDeliveryFollowUp(payload.delivery, {
            copiedFreshLink: true,
          }),
        ),
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to copy invite link.");
    } finally {
      setBusyAction(null);
    }
  }

  // Prepare data for the new queue workspace
  const commissionerData = {
    league,
    teams,
    remediationRecords: remediationEvidence,
    tradeOperations,
    transactions,
    rulings,
    lastScanResult: complianceSummary,
  };

  const commissionerActions = {
    onRunComplianceScan: runComplianceScan,
    onPhaseTransition: runPhaseTransition,
    onPublishRuling: publishRuling,
    busyAction,
  };

  return (
    <CommissionerQueueWorkspace
      data={commissionerData}
      actions={commissionerActions}
      error={error}
      message={message}
      checklistPanel={
        <WeeklyWorkflowChecklist
          items={WEEKLY_CHECKLIST_ITEMS}
          checkedIds={weeklyChecklistState}
          onToggle={toggleWeeklyChecklistItem}
          onRunComplianceScan={runComplianceScan}
          busyAction={busyAction}
          weekBucket={checklistStorageKey.split(":").pop() ?? ""}
          systemValidation={weeklyChecklistSystemValidation}
          testId="commissioner-weekly-workflow"
        />
      }
      testId="commissioner-page"
    >
      {/* Advanced Operations Sections for Secondary Context */}
      <OperationsSectionShell
        id="advanced-operations"
        testId="commissioner-advanced-operations"
        title="Advanced Operations"
        description="Workspace administration, league setup, routine operations, commissioenr rulings, and system management."
        summary={`${leagueWorkspaces.length} workspaces · ${teams.length} teams`}
      >
        <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div>
          <h3 className="text-sm font-semibold">League Workspace Administration</h3>
          <p className="mt-1 text-xs text-slate-400">
            Create league workspaces, switch active league context, and invite league members with optional team assignment.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-400 md:col-span-2">
            <span>Active Workspace</span>
            <select
              data-testid="workspace-active-select"
              value={activeLeagueId}
              onChange={(event) => setActiveLeagueId(event.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            >
              <option value="">Select workspace</option>
              {leagueWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name} ({formatLeagueMembershipContext(workspace)})
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              data-testid="workspace-switch-button"
              onClick={() => switchActiveLeagueWorkspace(activeLeagueId)}
              disabled={busyAction !== null || !activeLeagueId || activeLeagueId === league?.league.id}
              className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "workspace:switch" ? "Switching..." : "Switch Workspace"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <label className="space-y-1 text-xs text-slate-400">
            <span>New League Name</span>
            <input
              data-testid="workspace-create-name"
              value={leagueWorkspaceCreateForm.name}
              onChange={(event) =>
                setLeagueWorkspaceCreateForm((previous) => ({ ...previous, name: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            <span>Season Year</span>
            <input
              data-testid="workspace-create-season"
              type="number"
              min={2000}
              max={2100}
              value={leagueWorkspaceCreateForm.seasonYear}
              onChange={(event) =>
                setLeagueWorkspaceCreateForm((previous) => ({
                  ...previous,
                  seasonYear: event.target.value,
                }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              data-testid="workspace-create-button"
              onClick={createLeagueWorkspace}
              disabled={busyAction !== null || !canCreateLeagueWorkspace}
              className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "workspace:create" ? "Creating..." : "Create Workspace"}
            </button>
          </div>
          <label className="space-y-1 text-xs text-slate-400 lg:col-span-3">
            <span>Description</span>
            <input
              data-testid="workspace-create-description"
              value={leagueWorkspaceCreateForm.description}
              onChange={(event) =>
                setLeagueWorkspaceCreateForm((previous) => ({
                  ...previous,
                  description: event.target.value,
                }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
          <label className="space-y-1 text-xs text-slate-400 lg:col-span-2">
            <span>Team Owner Name</span>
            <input
              data-testid="workspace-invite-owner-name"
              value={leagueInviteForm.ownerName}
              onChange={(event) =>
                setLeagueInviteForm((previous) => ({ ...previous, ownerName: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400 lg:col-span-2">
            <span>Team Owner Email</span>
            <input
              data-testid="workspace-invite-owner-email"
              type="email"
              value={leagueInviteForm.ownerEmail}
              onChange={(event) =>
                setLeagueInviteForm((previous) => ({ ...previous, ownerEmail: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400 lg:col-span-2">
            <span>Team Name</span>
            <input
              data-testid="workspace-invite-team-name"
              value={leagueInviteForm.teamName}
              onChange={(event) =>
                setLeagueInviteForm((previous) => ({ ...previous, teamName: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400">
            <span>Team Abbr</span>
            <input
              data-testid="workspace-invite-team-abbr"
              value={leagueInviteForm.teamAbbreviation}
              onChange={(event) =>
                setLeagueInviteForm((previous) => ({
                  ...previous,
                  teamAbbreviation: event.target.value,
                }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <label className="space-y-1 text-xs text-slate-400 lg:col-span-3">
            <span>Division</span>
            <input
              data-testid="workspace-invite-division"
              value={leagueInviteForm.divisionLabel}
              onChange={(event) =>
                setLeagueInviteForm((previous) => ({ ...previous, divisionLabel: event.target.value }))
              }
              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <div className="flex items-end lg:col-span-2">
            <button
              type="button"
              data-testid="workspace-invite-button"
              onClick={inviteLeagueMember}
              disabled={busyAction !== null || !canInviteLeagueMember || !league}
              className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "workspace:invite" ? "Inviting..." : "Invite Member + Team"}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          Active league: <span data-testid="workspace-active-name">{league?.league.name ?? "Unknown"}</span> · Teams:{" "}
          <span data-testid="workspace-active-team-count">{teams.length}</span>
        </p>

        <InviteManagementPanel
          invites={leagueInvites}
          copyFreshLinkEnabled={inviteCopyFreshLinkEnabled}
          busyAction={busyAction}
          onResend={resendLeagueInvite}
          onRevoke={revokeLeagueInvite}
          onCopyFreshLink={copyFreshInviteLink}
        />
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-sm font-semibold">First-Run Setup Checklist</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-300">
          <li>Confirm league metadata and season weeks in League Settings.</li>
          <li>
            Configure active constitution values in <Link href="/rules" className="text-sky-300 hover:text-sky-200">Rules</Link>.
          </li>
          <li>
            Create teams and owners in{" "}
            <Link href="/commissioner/teams" className="text-sky-300 hover:text-sky-200">
              Commissioner Team Admin
            </Link>
            .
          </li>
          <li>
            Import or verify player pool in <Link href="/players" className="text-sky-300 hover:text-sky-200">Players</Link>.
          </li>
          <li>Run a league compliance scan and resolve blocking findings before weekly ops.</li>
        </ol>
        </section>
      </OperationsSectionShell>

      <OperationsSectionShell
        id="commissioner-routine"
        testId="commissioner-routine-zone"
        title="Routine Weekly Operations"
        description="Primary weekly commissioner actions with checklist, phase, compliance, and recent transactions."
        summary={`${checklistCompletedCount}/${WEEKLY_CHECKLIST_ITEMS.length} checklist items complete`}
        defaultOpen
      >

        <section
          data-testid="commissioner-routine-league-settings"
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h4 className="text-sm font-semibold">League Settings</h4>
              <p className="text-xs text-slate-400">
                Maintain active league metadata and season calendar values.
              </p>
            </div>
            <Link href="/rules" className="text-xs text-sky-300 hover:text-sky-200">
              Open rules configuration
            </Link>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
            <label className="space-y-1 text-xs text-slate-400 md:col-span-2">
              <span>League Name</span>
              <input
                value={leagueSettingsForm.name}
                onChange={(event) =>
                  setLeagueSettingsForm((previous) => ({ ...previous, name: event.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400 md:col-span-2 lg:col-span-3">
              <span>Description</span>
              <input
                value={leagueSettingsForm.description}
                onChange={(event) =>
                  setLeagueSettingsForm((previous) => ({ ...previous, description: event.target.value }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Regular Weeks</span>
              <input
                type="number"
                min={1}
                value={leagueSettingsForm.regularSeasonWeeks}
                onChange={(event) =>
                  setLeagueSettingsForm((previous) => ({
                    ...previous,
                    regularSeasonWeeks: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Playoff Start</span>
              <input
                type="number"
                min={1}
                value={leagueSettingsForm.playoffStartWeek}
                onChange={(event) =>
                  setLeagueSettingsForm((previous) => ({
                    ...previous,
                    playoffStartWeek: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Playoff End</span>
              <input
                type="number"
                min={1}
                value={leagueSettingsForm.playoffEndWeek}
                onChange={(event) =>
                  setLeagueSettingsForm((previous) => ({
                    ...previous,
                    playoffEndWeek: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={saveLeagueSettings}
                disabled={busyAction !== null}
                className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
              >
                {busyAction === "league:save" ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div
            data-testid="commissioner-routine-phase-card"
            className="rounded-lg border border-slate-800 bg-slate-950 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">Active Phase</p>
            <p className="mt-2 text-lg font-semibold">
              {league ? `Season ${league.season.year} · ${formatLeaguePhaseLabel(league.season.phase)}` : "Loading..."}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {PHASES.map((phase) => (
                <button
                  key={phase}
                  type="button"
                  onClick={() => runPhaseTransition(phase)}
                  disabled={!league || busyAction !== null || league.season.phase === phase}
                  className="rounded-md border border-slate-700 px-2 py-1.5 text-xs text-slate-200 disabled:opacity-50"
                >
                  {formatLeaguePhaseLabel(phase)}
                </button>
              ))}
            </div>
          </div>

          <div
            data-testid="commissioner-routine-compliance-card"
            className="rounded-lg border border-slate-800 bg-slate-950 p-4"
          >
            <p className="text-xs uppercase tracking-wide text-slate-400">Compliance Scan</p>
            <button
              type="button"
              onClick={runComplianceScan}
              disabled={busyAction !== null}
              className="mt-3 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              {busyAction === "compliance" ? "Running..." : "Run League Scan"}
            </button>
            {complianceSummary ? (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div>OK: {complianceSummary.ok}</div>
                <div>Warn: {complianceSummary.warning}</div>
                <div>Error: {complianceSummary.error}</div>
                <div>Findings: {complianceSummary.totalFindings}</div>
              </div>
            ) : null}
          </div>
        </section>

        <section
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
          data-testid="commissioner-remediation-evidence"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-semibold">Guided Remediation Evidence</h4>
              <p className="mt-1 text-xs text-slate-400">
                Central view of owner remediation completion status and step-level evidence.
              </p>
            </div>
            <span className="text-xs text-slate-400">{remediationEvidenceRows.length} active records</span>
          </div>

          <ul className="mt-3 space-y-2 text-xs">
            {remediationEvidenceRows.map((record) => {
              const completedSteps = record.steps.filter((step) => step.completed).length;
              const statusClass =
                record.status === "Pending review"
                  ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-100"
                  : record.status === "In Progress"
                    ? "border-amber-700/60 bg-amber-950/30 text-amber-100"
                    : "border-slate-700 bg-slate-900 text-slate-200";
              return (
                <li key={record.id} className="rounded border border-slate-800 bg-slate-900 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-100">
                      {record.teamName} · {record.ruleCode}
                    </p>
                    <span className={`rounded border px-2 py-0.5 ${statusClass}`}>{record.status}</span>
                  </div>
                  <p className="mt-1 text-slate-300">{record.message}</p>
                  <p className="mt-1 text-slate-400">
                    Due {new Date(record.dueAt).toLocaleString()} · Steps {completedSteps}/{record.steps.length}
                    {record.acknowledgedAt
                      ? ` · Owner acknowledged ${new Date(record.acknowledgedAt).toLocaleString()}`
                      : " · Owner acknowledgment pending"}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                    {record.steps.map((step) => (
                      <li key={step.id}>
                        {step.completed ? "✓" : "○"} {step.label}
                        {step.completedAt ? ` (${new Date(step.completedAt).toLocaleString()})` : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            {remediationEvidenceRows.length === 0 ? (
              <li className="text-slate-500">No guided remediation evidence submitted yet.</li>
            ) : null}
          </ul>
        </section>

        <section
          data-testid="commissioner-routine-transactions"
          className="rounded-lg border border-slate-800"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
            <h4 className="text-sm font-semibold">Recent Transactions</h4>
            <button
              type="button"
              onClick={() =>
                loadTransactions().catch(() => setError("Failed to refresh transactions."))
              }
              className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200"
            >
              Refresh
            </button>
          </div>
          <ul className="space-y-2 p-4 text-sm">
            {transactions.map((transaction) => (
              <li
                key={transaction.id}
                className="rounded border border-slate-800 bg-slate-950 px-3 py-2"
              >
                <p>{transaction.summary}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {transaction.type} · {transaction.team?.name ?? "League"} ·{" "}
                  {new Date(transaction.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
            {transactions.length === 0 ? (
              <li className="text-slate-500">No transactions found.</li>
            ) : null}
          </ul>
        </section>
      </OperationsSectionShell>

      <OperationsSectionShell
        id="commissioner-rulings"
        testId="commissioner-rulings-sla"
        title="SLA Queue and Policy-Linked Rulings"
        description="Prioritized dispute queue with due-date context and publishable rulings tied to cited rules."
        summary={`${disputeQueue.length} open dispute${disputeQueue.length === 1 ? "" : "s"} · ${rulings.length} rulings`}
      >

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <h4 className="text-sm font-semibold">Open Disputes (SLA Sorted)</h4>
            <ul className="mt-2 space-y-2 text-sm" data-testid="commissioner-dispute-queue">
              {disputeQueue.map((item) => (
                <li key={item.id} className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      name="commissioner-dispute"
                      checked={selectedDisputeId === item.id}
                      onChange={() => setSelectedDisputeId(item.id)}
                    />
                    <span>
                      <span className="font-medium text-slate-100">{item.title}</span>
                      <span className="mt-1 block text-xs text-slate-400">{item.summary}</span>
                      <span className="mt-1 inline-flex items-center gap-2 text-[11px] text-slate-400">
                        <span
                          className={`rounded border px-1.5 py-0.5 ${
                            item.severity === "high"
                              ? "border-red-700/50 bg-red-950/30 text-red-200"
                              : "border-amber-700/50 bg-amber-950/30 text-amber-200"
                          }`}
                        >
                          {item.severity.toUpperCase()}
                        </span>
                        Due {new Date(item.dueAt).toLocaleString()}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
              {disputeQueue.length === 0 ? (
                <li className="text-xs text-slate-500">No open disputes in queue.</li>
              ) : null}
            </ul>
          </section>

          <section className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <h4 className="text-sm font-semibold">Publish Ruling</h4>
            <p className="mt-1 text-xs text-slate-400">
              Include policy citation and due-date context before publishing.
            </p>
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-300">
                Selected dispute:{" "}
                <span className="font-medium text-slate-100">{selectedDispute?.title ?? "None selected"}</span>
              </p>
              <label className="block text-xs text-slate-400">
                <span className="mb-1 block">Decision</span>
                <select
                  value={rulingDecision}
                  onChange={(event) => setRulingDecision(event.target.value as CommissionerRulingRecord["decision"])}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                >
                  <option value="manual-review">Manual Review</option>
                  <option value="approve">Approve</option>
                  <option value="deny">Deny</option>
                </select>
              </label>
              <label className="block text-xs text-slate-400">
                <span className="mb-1 block">Rule Citation</span>
                <input
                  value={rulingCitation}
                  onChange={(event) => setRulingCitation(event.target.value)}
                  className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                  placeholder="RULE-TRADE-001"
                />
              </label>
              <label className="block text-xs text-slate-400">
                <span className="mb-1 block">Ruling Notes</span>
                <textarea
                  value={rulingNotes}
                  onChange={(event) => setRulingNotes(event.target.value)}
                  className="min-h-20 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
                />
              </label>
              <button
                type="button"
                onClick={publishRuling}
                disabled={!selectedDispute}
                className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-200 disabled:opacity-50"
                data-testid="commissioner-publish-ruling"
              >
                Publish Ruling
              </button>
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-slate-800 bg-slate-900 p-3" data-testid="commissioner-rulings-history">
          <h4 className="text-sm font-semibold">Ruling Audit History</h4>
          <ul className="mt-2 space-y-2 text-sm">
            {rulings.map((ruling) => (
              <li key={ruling.id} className="rounded border border-slate-800 bg-slate-950 px-3 py-2">
                <p className="font-medium text-slate-100">{ruling.disputeTitle}</p>
                <p className="mt-1 text-xs text-slate-300">
                  Decision: {ruling.decision} · Rule: {ruling.ruleCitation}
                </p>
                <p className="text-xs text-slate-400">
                  Due context: {new Date(ruling.dueAt).toLocaleString()} · Published{" "}
                  {new Date(ruling.publishedAt).toLocaleString()} by {ruling.actorEmail}
                </p>
                <p className="mt-1 text-xs text-slate-300">{ruling.notes}</p>
              </li>
            ))}
            {rulings.length === 0 ? <li className="text-xs text-slate-500">No rulings published yet.</li> : null}
          </ul>
        </section>
      </OperationsSectionShell>

      <OperationsSectionShell
        id="commissioner-advanced"
        testId="commissioner-advanced-zone"
        title="Advanced Operations"
        description="Seasonal transitions and manual interventions that need extra review."
        summary={`${hasRolloverPreview ? "Rollover preview ready" : "No rollover preview"} · ${hasFixPreviewForCurrentConfig ? "Fix dry run ready" : "No fix dry run"}`}
        tone="warning"
      >

        <section
          data-testid="commissioner-advanced-rollover"
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">Offseason Rollover</p>
          <p className="mt-1 text-xs text-slate-400">
            Run preview here, then apply from the Danger Zone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              data-testid="rollover-preview-button"
              type="button"
              onClick={() => runRollover(true)}
              disabled={busyAction !== null}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
            >
              Preview
            </button>
          </div>
          <p
            data-testid="rollover-preview-status"
            className="mt-2 text-xs text-slate-300"
          >
            {hasRolloverPreview
              ? "Preview complete. Danger Zone apply is unlocked once confirmations are complete."
              : "No preview available for apply."}
          </p>
          {rolloverResult ? (
            <div className="mt-3 space-y-1 text-xs text-slate-300">
              <p>
                Target: {rolloverResult.targetSeason.year} (
                {rolloverResult.targetSeason.created ? "new" : "existing"})
              </p>
              <p>Carried Contracts: {rolloverResult.counts.carriedContracts}</p>
              <p>Expired Contracts: {rolloverResult.counts.expiredContracts}</p>
            </div>
          ) : null}
        </section>

        <section
          data-testid="commissioner-advanced-fix"
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h4 className="text-sm font-semibold">Emergency Team Fix</h4>
              <p className="text-xs text-slate-400">
                Run dry-run preflight with target settings before any apply action.
              </p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1 text-xs text-slate-400">
              <span>Team</span>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                value={fixForm.teamId}
                onChange={(event) =>
                  setFixForm((previous) => ({
                    ...previous,
                    teamId: event.target.value,
                  }))
                }
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Roster Max</span>
              <input
                type="number"
                min={0}
                value={fixForm.targetRosterMax}
                onChange={(event) =>
                  setFixForm((previous) => ({
                    ...previous,
                    targetRosterMax: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Cap Target</span>
              <select
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                value={fixForm.targetCapType}
                onChange={(event) =>
                  setFixForm((previous) => ({
                    ...previous,
                    targetCapType: event.target.value as FixFormState["targetCapType"],
                  }))
                }
              >
                <option value="soft">Soft Cap</option>
                <option value="hard">Hard Cap</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Custom Cap</span>
              <input
                type="number"
                min={0}
                disabled={fixForm.targetCapType !== "custom"}
                value={fixForm.targetCapValue}
                onChange={(event) =>
                  setFixForm((previous) => ({
                    ...previous,
                    targetCapValue: event.target.value,
                  }))
                }
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 disabled:opacity-50"
              />
            </label>

            <div className="space-y-2 md:col-span-2 xl:col-span-5">
              <button
                data-testid="fix-preview-button"
                type="button"
                onClick={() => runEmergencyFix(true)}
                disabled={busyAction !== null || !canSubmitFix}
                className="w-full rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
              >
                {busyAction === "fix:preview" ? "Running..." : "Run Dry Run"}
              </button>
              <p data-testid="fix-preview-status" className="text-xs text-slate-300">
                {hasFixPreviewForCurrentConfig
                  ? "Dry run for current settings is complete. Danger Zone apply is unlocked once confirmations are complete."
                  : "Run dry run for current settings before apply."}
              </p>
            </div>
          </div>

          {fixResult ? (
            <div
              data-testid="fix-impact-summary"
              className="mt-4 space-y-2 rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300"
            >
              <p className="font-semibold text-slate-200">Preflight Impact Summary</p>
              <p>
                {fixResult.dryRun ? "Dry Run" : "Applied"} · {fixResult.team.name}
              </p>
              <p>
                Roster {fixResult.before.rosterCount} → {fixResult.after.rosterCount} (
                {formatSignedValue(fixResult.after.rosterCount - fixResult.before.rosterCount)})
              </p>
              <p>
                Cap ${fixResult.before.totalCapHit} → ${fixResult.after.totalCapHit} (
                {formatSignedValue(fixResult.after.totalCapHit - fixResult.before.totalCapHit)})
              </p>
              <p>Players to Drop: {fixResult.droppedPlayers.length}</p>
              <p>
                Unresolved: {fixResult.unresolved.hasUnresolved ? "Yes" : "No"} (Roster+
                {fixResult.unresolved.rosterExcess}, Cap+{fixResult.unresolved.capOverage})
              </p>
            </div>
          ) : null}
        </section>

        <section
          data-testid="commissioner-advanced-snapshot"
          className="rounded-lg border border-slate-800 bg-slate-950 p-4"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h4 className="text-sm font-semibold">Snapshot Backup and Restore</h4>
              <p className="text-xs text-slate-400">
                Export current league state and run import preview checks before Danger Zone apply.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                data-testid="snapshot-export-button"
                type="button"
                onClick={exportSnapshot}
                disabled={busyAction !== null}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
              >
                {busyAction === "snapshot:export" ? "Exporting..." : "Export Snapshot"}
              </button>
              <button
                data-testid="snapshot-preview-button"
                type="button"
                onClick={previewSnapshotImport}
                disabled={busyAction !== null || !snapshotJson.trim()}
                className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-100 disabled:opacity-50"
              >
                {busyAction === "snapshot:preview" ? "Previewing..." : "Preview Import"}
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <ol
              data-testid="snapshot-sequence-guide"
              className="space-y-1 rounded-md border border-slate-800 bg-slate-900/70 p-3 text-xs text-slate-300"
            >
              <li>
                1. Export a fresh backup snapshot.
                {" "}
                <span className={snapshotJson.trim() ? "text-emerald-300" : "text-amber-300"}>
                  {snapshotJson.trim() ? "Complete" : "Pending"}
                </span>
              </li>
              <li>
                2. Run preview and review impact details.
                {" "}
                <span className={hasSnapshotPreviewForCurrentJson ? "text-emerald-300" : "text-amber-300"}>
                  {hasSnapshotPreviewForCurrentJson ? "Complete" : "Pending"}
                </span>
              </li>
              <li>
                3. Confirm destructive apply phrase and replacement acknowledgment.
                {" "}
                <span className={canApplySnapshotRestore ? "text-emerald-300" : "text-amber-300"}>
                  {canApplySnapshotRestore ? "Ready" : "Pending"}
                </span>
              </li>
            </ol>

            <textarea
              value={snapshotJson}
              onChange={(event) => {
                setSnapshotJson(event.target.value);
                setSnapshotPreview(null);
                setLastSnapshotPreviewSource(null);
                setSnapshotReplaceExisting(false);
                setSnapshotApplyConfirmation("");
                setSnapshotValidationFindings([]);
              }}
              placeholder="Paste snapshot JSON here for preview/apply restore."
              data-testid="snapshot-json-input"
              className="min-h-64 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-xs text-slate-100"
            />

            <p data-testid="snapshot-preview-status" className="text-xs text-slate-300">
              {hasSnapshotPreviewForCurrentJson
                ? "Preview complete for current JSON. Danger Zone apply is unlocked once confirmations are complete."
                : "Run preview for the current JSON before apply."}
            </p>

            {snapshotValidationFindings.length > 0 ? (
              <div
                data-testid="snapshot-validation-errors"
                className="rounded-md border border-red-800/60 bg-red-950/20 p-3 text-xs text-red-200"
              >
                <p className="font-semibold">Validation errors</p>
                <ul className="mt-2 space-y-1">
                  {snapshotValidationFindings.map((finding, index) => (
                    <li key={`${finding.code}-${index}`}>
                      {finding.code}: {finding.message}
                      {finding.path ? ` (${finding.path})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {snapshotPreview ? (
              <div className="rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
                <p>
                  Mode: {snapshotPreview.mode}
                  {snapshotPreview.mode === "apply" && snapshotPreview.applied ? " (applied)" : ""}
                </p>
                <p className="mt-1">
                  Counts: teams {snapshotPreview.counts.teams}, players{" "}
                  {snapshotPreview.counts.players}, contracts {snapshotPreview.counts.contracts}, picks{" "}
                  {snapshotPreview.counts.futurePicks}
                </p>
                {snapshotPreview.preview ? (
                  <p
                    data-testid="snapshot-confirmation-phrase"
                    className="mt-1 font-mono text-amber-200"
                  >
                    Confirmation phrase: {snapshotPreview.preview.confirmationPhrase}
                  </p>
                ) : null}
                {snapshotImpact ? (
                  <div
                    data-testid="snapshot-impact-summary"
                    className="mt-3 space-y-2 rounded-md border border-red-800/40 bg-red-950/20 p-3"
                  >
                    <p className="font-semibold text-red-100">Preflight Impact Summary</p>
                    <p>
                      Records to delete: {snapshotImpact.totals.recordsToDelete}
                    </p>
                    <p>
                      Records to insert: {snapshotImpact.totals.recordsToInsert}
                    </p>
                    <p>
                      Net delta: {formatSignedValue(snapshotImpact.totals.deltaRecords)}
                    </p>
                    <p>
                      Source snapshot season: {snapshotImpact.source.snapshotSeasonYear}
                    </p>
                    <p>
                      Active season: {snapshotImpact.source.activeSeasonYear} (
                      {snapshotImpact.source.matchesActiveSeason
                        ? "matches current context"
                        : "does not match current context"}
                      )
                    </p>
                    <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
                      {SNAPSHOT_IMPACT_KEYS.map((key) => (
                        <p key={key}>
                          {key}: {snapshotImpact.perEntity[key].current} →{" "}
                          {snapshotImpact.perEntity[key].incoming} (
                          {formatSignedValue(snapshotImpact.perEntity[key].delta)})
                        </p>
                      ))}
                    </div>
                  </div>
                ) : null}
                <p className="mt-1">Findings: {snapshotPreview.findings.length}</p>
                {snapshotPreview.findings.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {snapshotPreview.findings.slice(0, 8).map((finding, index) => (
                      <li
                        key={`${finding.code}-${index}`}
                        className="rounded border border-amber-700/40 bg-amber-950/20 px-2 py-1 text-amber-200"
                      >
                        {finding.code}: {finding.message}
                        {finding.path ? ` (${finding.path})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </OperationsSectionShell>

      <OperationsSectionShell
        id="commissioner-danger"
        testId="commissioner-danger-zone"
        title="Danger Zone"
        description="Destructive operations require preflight completion and explicit confirmation text."
        summary={`${canApplyRollover || canApplyFix || canApplySnapshotRestore ? "Apply action ready" : "No apply action ready"}`}
        tone="danger"
      >

        <section
          data-testid="danger-rollover-section"
          className="space-y-3 rounded-md border border-red-800/70 bg-slate-950/60 p-3"
        >
          <h4 className="text-sm font-semibold text-red-100">Apply Offseason Rollover</h4>
          <p className="text-xs text-slate-300">
            Preflight status:{" "}
            <span className={hasRolloverPreview ? "text-emerald-300" : "text-amber-300"}>
              {hasRolloverPreview ? "Preview ready" : "Run preview in Advanced Operations first"}
            </span>
          </p>
          <label className="flex items-start gap-2 text-xs text-red-100">
            <input
              data-testid="rollover-apply-confirm-checkbox"
              type="checkbox"
              checked={rolloverApplyConfirmed}
              onChange={(event) => setRolloverApplyConfirmed(event.target.checked)}
            />
            I confirm this rollover should mutate league season data.
          </label>
          <label className="space-y-1 text-xs text-red-100">
            <span>Type {ROLLOVER_CONFIRM_TEXT} to enable apply.</span>
            <input
              data-testid="rollover-apply-confirm-input"
              value={rolloverApplyConfirmation}
              onChange={(event) => setRolloverApplyConfirmation(event.target.value)}
              className="w-full rounded-md border border-red-700/70 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <button
            data-testid="rollover-apply-button"
            type="button"
            onClick={() => runRollover(false)}
            disabled={busyAction !== null || !canApplyRollover}
            className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-100 disabled:opacity-50"
          >
            {busyAction === "rollover:run" ? "Applying..." : "Apply Rollover"}
          </button>
        </section>

        <section
          data-testid="danger-fix-section"
          className="space-y-3 rounded-md border border-red-800/70 bg-slate-950/60 p-3"
        >
          <h4 className="text-sm font-semibold text-red-100">Apply Emergency Team Fix</h4>
          <p className="text-xs text-slate-300">
            Preflight status:{" "}
            <span className={hasFixPreviewForCurrentConfig ? "text-emerald-300" : "text-amber-300"}>
              {hasFixPreviewForCurrentConfig
                ? "Dry run for current settings ready"
                : "Run dry run in Advanced Operations first"}
            </span>
          </p>
          <label className="flex items-start gap-2 text-xs text-red-100">
            <input
              data-testid="fix-apply-confirm-checkbox"
              type="checkbox"
              checked={fixApplyConfirmed}
              onChange={(event) => setFixApplyConfirmed(event.target.checked)}
            />
            I confirm roster and cap drops are expected for this team.
          </label>
          <label className="space-y-1 text-xs text-red-100">
            <span>Type {FIX_CONFIRM_TEXT} to enable apply.</span>
            <input
              data-testid="fix-apply-confirm-input"
              value={fixApplyConfirmation}
              onChange={(event) => setFixApplyConfirmation(event.target.value)}
              className="w-full rounded-md border border-red-700/70 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <button
            data-testid="fix-apply-button"
            type="button"
            onClick={() => runEmergencyFix(false)}
            disabled={busyAction !== null || !canApplyFix}
            className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-100 disabled:opacity-50"
          >
            {busyAction === "fix:apply" ? "Applying..." : "Apply Fix"}
          </button>
        </section>

        <section
          data-testid="danger-snapshot-section"
          className="space-y-3 rounded-md border border-red-800/70 bg-slate-950/60 p-3"
        >
          <h4 className="text-sm font-semibold text-red-100">Apply Snapshot Restore</h4>
          <p className="text-xs text-slate-300">
            Preflight status:{" "}
            <span className={hasSnapshotPreviewForCurrentJson ? "text-emerald-300" : "text-amber-300"}>
              {hasSnapshotPreviewForCurrentJson
                ? "Preview for current JSON ready"
                : "Run snapshot preview for current JSON first"}
            </span>
          </p>
          <label className="flex items-start gap-2 text-xs text-red-100">
            <input
              data-testid="snapshot-apply-confirm-checkbox"
              type="checkbox"
              checked={snapshotReplaceExisting}
              onChange={(event) => setSnapshotReplaceExisting(event.target.checked)}
            />
            I understand this restore replaces existing local league data.
          </label>
          <label className="space-y-1 text-xs text-red-100">
            <span>Type {snapshotConfirmationPhrase} to enable apply.</span>
            <input
              data-testid="snapshot-apply-confirm-input"
              value={snapshotApplyConfirmation}
              onChange={(event) => setSnapshotApplyConfirmation(event.target.value)}
              className="w-full rounded-md border border-red-700/70 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
            />
          </label>
          <button
            data-testid="snapshot-apply-button"
            type="button"
            onClick={applySnapshotImport}
            disabled={busyAction !== null || !canApplySnapshotRestore}
            className="rounded-md border border-red-700 px-3 py-1.5 text-sm text-red-100 disabled:opacity-50"
          >
            {busyAction === "snapshot:apply" ? "Applying..." : "Apply Restore"}
          </button>
        </section>
      </OperationsSectionShell>
    </CommissionerQueueWorkspace>
  );
}
