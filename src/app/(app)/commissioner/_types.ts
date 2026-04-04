import type { WeeklyWorkflowItem } from "@/components/commissioner/weekly-workflow-checklist";
import type { CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import type { RemediationRecord } from "@/lib/compliance/remediation";
import type { LeagueSummaryPayload } from "@/types/league";
import type { SnapshotPreviewReceipt, SnapshotRestoreImpactSummary } from "@/types/snapshot";
import type { TradeHomeResponse } from "@/types/trade-workflow";

export type LeaguePayload = LeagueSummaryPayload;

export type TeamPayload = {
  teams: {
    id: string;
    name: string;
    complianceStatus: "ok" | "warning" | "error";
  }[];
};

export type TransactionPayload = {
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

export type TradeOperationsPayload = Pick<TradeHomeResponse, "summary" | "sections">;

export type CommissionerDisputeItem = {
  id: string;
  type: "compliance" | "trade";
  severity: "high" | "medium";
  title: string;
  summary: string;
  dueAt: string;
};

export type CommissionerRulingRecord = {
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

export type ComplianceQueuePayload = {
  queue: {
    remediationRecords: RemediationRecord[];
  };
};

export type OverrideHistoryPayload = {
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

export type LeagueWorkspace = {
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

export type LeagueWorkspaceListPayload = {
  leagues: LeagueWorkspace[];
};

export type ComplianceScanPayload = {
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

export type RolloverPayload = {
  rollover: {
    dryRun: boolean;
    sourceSeason: { id: string; year: number; phase: string };
    targetSeason: { id: string | null; year: number; phase: string; created: boolean };
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

export type EmergencyFixPayload = {
  fix: {
    team: { id: string; name: string };
    dryRun: boolean;
    policy: { targetRosterMax: number; targetCapType: "soft" | "hard" | "custom"; targetCapValue: number };
    before: { rosterCount: number; totalCapHit: number };
    after: { rosterCount: number; totalCapHit: number };
    droppedPlayers: { playerId: string; name: string; position: string; salary: number; rosterSlotsRemoved: number }[];
    unresolved: { rosterExcess: number; capOverage: number; hasUnresolved: boolean };
  };
};

export type SnapshotExportPayload = {
  snapshot: Record<string, unknown>;
  counts: {
    leagues: number; seasons: number; rulesets: number; owners: number; teams: number;
    players: number; rosterSlots: number; contracts: number; capPenalties: number;
    futurePicks: number; drafts: number; draftSelections: number; trades: number;
    tradeAssets: number; transactions: number;
  };
};

export type SnapshotImportPayload = {
  mode: "preview" | "apply";
  replaceExisting: boolean;
  counts: SnapshotExportPayload["counts"];
  preview?: SnapshotPreviewReceipt;
  impact?: SnapshotRestoreImpactSummary;
  findings: { code: string; message: string; path?: string }[];
  applied?: boolean;
};

export type SnapshotImportApiError = {
  message: string;
  findings: SnapshotImportPayload["findings"];
};

export type FixFormState = {
  teamId: string;
  targetRosterMax: string;
  targetCapType: "soft" | "hard" | "custom";
  targetCapValue: string;
};

export type LeagueSettingsFormState = {
  name: string;
  description: string;
  regularSeasonWeeks: string;
  playoffStartWeek: string;
  playoffEndWeek: string;
};

export type LeagueWorkspaceCreateFormState = {
  name: string;
  description: string;
  seasonYear: string;
};

export type LeagueInviteFormState = {
  ownerName: string;
  ownerEmail: string;
  teamName: string;
  teamAbbreviation: string;
  divisionLabel: string;
};

export type LeagueInvitesPayload = {
  invites: CommissionerInviteRow[];
  capabilities: { copyFreshLink: boolean };
};

export type EmailDeliveryPayload = {
  state: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown";
  label: string;
  detail: string;
  attemptedAt: string | null;
  canRetry: boolean;
  inviteStillValid: boolean;
};

// ── Constants ──────────────────────────────────────────────────────────────

export const PHASES: LeaguePayload["season"]["phase"][] = [
  "PRESEASON",
  "REGULAR_SEASON",
  "PLAYOFFS",
  "OFFSEASON",
];
export const ROLLOVER_CONFIRM_TEXT = "RUN ROLLOVER";
export const FIX_CONFIRM_TEXT = "APPLY FIX";
export const SNAPSHOT_CONFIRM_TEXT = "APPLY RESTORE";
export const SNAPSHOT_IMPACT_KEYS = [
  "teams",
  "players",
  "rosterSlots",
  "contracts",
  "futurePicks",
  "transactions",
] as const;

export const WEEKLY_CHECKLIST_ITEMS: WeeklyWorkflowItem[] = [
  {
    id: "phase-review",
    title: "Confirm active phase and weekly transition window",
    description: "Validate the league is operating in the expected season phase before running weekly actions.",
  },
  {
    id: "compliance-scan",
    title: "Run league compliance scan and review blockers",
    description: "Surface roster and cap violations before trades and waiver processing are finalized.",
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
    description: "Complete proposal settlement so player and pick ownership stay current before lineups lock.",
    href: "/trades?from=workflow&step=trade-processing-queue",
    ctaLabel: "Open Settlement Queue",
  },
  {
    id: "audit-health-check",
    title: "Review commissioner audit activity",
    description: "Check recent operational records across lifecycle, compliance, trades, drafts, auctions, and sync.",
    href: "/commissioner/audit",
    ctaLabel: "Open Audit",
  },
];

// ── Utilities ──────────────────────────────────────────────────────────────

export function formatLeagueMembershipContext(workspace: Pick<LeagueWorkspace, "leagueRole" | "teamName">) {
  if (workspace.leagueRole === "COMMISSIONER") {
    return workspace.teamName ? `Commissioner · Team: ${workspace.teamName}` : "Commissioner";
  }
  return workspace.teamName ? `Member · Team: ${workspace.teamName}` : "Member";
}

export function getIsoWeekBucket(date: Date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function formatSignedValue(value: number) {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function toCommissionerRulingRecord(
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

export function joinStatusMessage(base: string, followUp: string | null) {
  return followUp ? `${base} ${followUp}` : base;
}

export function buildInviteDeliveryFollowUp(
  delivery: EmailDeliveryPayload | null | undefined,
  options: { copiedFreshLink?: boolean } = {},
) {
  if (!delivery) return null;
  if (options.copiedFreshLink && (delivery.state === "failed" || delivery.state === "not_configured")) {
    return "Use the copied link directly while outbound email delivery is unavailable.";
  }
  return delivery.detail;
}

export async function postSnapshotImport(
  body: Record<string, unknown>,
): Promise<{ ok: true; payload: SnapshotImportPayload } | { ok: false; error: SnapshotImportApiError }> {
  function parseJsonMaybe(input: string): unknown {
    if (!input.trim()) return {};
    try {
      return JSON.parse(input);
    } catch {
      return { message: input.slice(0, 250) };
    }
  }

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

  const errorPayload = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error: SnapshotImportApiError }).error
    : { message: `Request failed with status ${response.status}`, findings: [] };

  return { ok: false, error: errorPayload };
}
