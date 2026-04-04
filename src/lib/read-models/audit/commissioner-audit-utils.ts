import type {
  CommissionerAuditEntrySummary,
  CommissionerAuditSourceKind,
} from "@/lib/read-models/audit/types";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function encodeEntryId(sourceKind: CommissionerAuditSourceKind, sourceId: string) {
  return `${sourceKind}:${sourceId}`;
}

export function decodeEntryId(entryId: string): {
  sourceKind: CommissionerAuditSourceKind;
  sourceId: string;
} | null {
  const [sourceKind, ...rest] = entryId.split(":");
  const sourceId = rest.join(":");

  if (!sourceId) {
    return null;
  }

  const validKinds: CommissionerAuditSourceKind[] = [
    "phase_transition",
    "commissioner_override",
    "compliance_action",
    "transaction",
    "trade_proposal",
    "draft_selection",
    "auction_award",
    "sync_mismatch",
  ];

  return validKinds.includes(sourceKind as CommissionerAuditSourceKind)
    ? {
        sourceKind: sourceKind as CommissionerAuditSourceKind,
        sourceId,
      }
    : null;
}

export function buildActor(input: {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  leagueRole?: string | null;
}) {
  const hasValue = Boolean(input.userId || input.email || input.name || input.leagueRole);
  if (!hasValue) {
    return null;
  }

  return {
    userId: input.userId ?? null,
    email: input.email ?? null,
    name: input.name ?? null,
    leagueRole: input.leagueRole ?? null,
  };
}

export function matchesActorFilter(entry: CommissionerAuditEntrySummary, actorFilter: string | null) {
  if (!actorFilter) {
    return true;
  }

  const normalized = actorFilter.toLowerCase();
  return (
    entry.actor?.userId?.toLowerCase() === normalized ||
    entry.actor?.email?.toLowerCase() === normalized
  );
}

export function matchesEntityFilter(
  entry: CommissionerAuditEntrySummary,
  entityType: string | null,
  entityId: string | null,
) {
  if (entityType && entry.entity?.entityType !== entityType) {
    return false;
  }

  if (entityId && entry.entity?.entityId !== entityId) {
    return false;
  }

  return true;
}

export function sortEntriesDesc(left: CommissionerAuditEntrySummary, right: CommissionerAuditEntrySummary) {
  const timeDelta = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }

  return right.id.localeCompare(left.id);
}

export function buildSections(sections: Array<{ label: string; value: Record<string, unknown> | null }>) {
  return sections.filter((section) => section.value && Object.keys(section.value).length > 0);
}
