export type CommissionerAuditSourceKind =
  | "phase_transition"
  | "commissioner_override"
  | "compliance_action"
  | "transaction"
  | "trade_proposal"
  | "draft_selection"
  | "auction_award"
  | "sync_mismatch";

export type CommissionerAuditEntrySummary = {
  id: string;
  sourceKind: CommissionerAuditSourceKind;
  sourceId: string;
  auditType: string;
  occurredAt: string;
  status: string | null;
  headline: string;
  detail: string;
  actor: {
    userId: string | null;
    email: string | null;
    name: string | null;
    leagueRole: string | null;
  } | null;
  team: {
    id: string;
    name: string;
    abbreviation?: string | null;
  } | null;
  relatedTeam: {
    id: string;
    name: string;
    abbreviation?: string | null;
  } | null;
  entity: {
    entityType: string;
    entityId: string;
    label: string | null;
  } | null;
};

export type CommissionerAuditEntryDetail = CommissionerAuditEntrySummary & {
  sourceRecord: Record<string, unknown>;
  sections: {
    label: string;
    value: Record<string, unknown> | null;
  }[];
};

export type CommissionerAuditProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string | null;
    year: number | null;
  };
  filters: {
    seasonId: string | null;
    teamId: string | null;
    type: string | null;
    actor: string | null;
    entityType: string | null;
    entityId: string | null;
    limit: number;
  };
  summary: {
    total: number;
    byType: Record<string, number>;
    bySourceKind: Record<string, number>;
  };
  seasons: {
    id: string;
    year: number;
    status: string;
    phase: string;
  }[];
  teams: {
    id: string;
    name: string;
    abbreviation: string | null;
  }[];
  entries: CommissionerAuditEntrySummary[];
};
