import { createHash } from "node:crypto";
import type { RosterStatus, TransactionType } from "@prisma/client";
import type {
  NormalizedRosterImportRow,
  NormalizedTransactionImportRow,
} from "@/lib/domain/sync/adapters/types";

export type SyncDomain = "roster" | "transactions";

export type SyncDetection = {
  domain: SyncDomain;
  fingerprint: string;
  mismatchType:
    | "ROSTER_MISSING_IN_APP"
    | "ROSTER_MISSING_IN_HOST"
    | "ROSTER_TEAM_DIFFERENCE"
    | "ROSTER_STATUS_DIFFERENCE"
    | "TRANSACTION_MISSING_IN_APP"
    | "TRANSACTION_MISSING_IN_HOST"
    | "TRANSACTION_TEAM_DIFFERENCE"
    | "TRANSACTION_SUMMARY_DIFFERENCE";
  severity: "INFO" | "WARNING" | "HIGH_IMPACT";
  title: string;
  message: string;
  teamId?: string | null;
  playerId?: string | null;
  rosterAssignmentId?: string | null;
  hostPlatformReferenceId?: string | null;
  hostValue: Record<string, unknown> | null;
  dynastyValue: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function safeDateIso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

export function payloadDigest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? null)).digest("hex");
}

export function rosterSnapshotForFingerprint(input: {
  playerKey: string | null;
  teamKey: string | null;
  rosterStatus: RosterStatus;
  hostPlatformReferenceId: string | null;
}) {
  return {
    playerKey: input.playerKey,
    teamKey: input.teamKey,
    rosterStatus: input.rosterStatus,
    hostPlatformReferenceId: input.hostPlatformReferenceId,
  };
}

export function transactionSnapshotForFingerprint(input: {
  typeKey: string | null;
  summary: string;
  teamKey: string | null;
  playerKey: string | null;
}) {
  return {
    typeKey: input.typeKey,
    summary: normalizeText(input.summary),
    teamKey: input.teamKey,
    playerKey: input.playerKey,
  };
}

export function buildSyncFingerprint(input: {
  seasonId: string;
  domain: SyncDomain;
  snapshot: Record<string, unknown>;
}) {
  return JSON.stringify({
    seasonId: input.seasonId,
    domain: input.domain,
    ...input.snapshot,
  });
}

export function normalizeImportedTransactionType(
  value: TransactionType | string | null | undefined,
) {
  if (!value) {
    return null;
  }

  return normalizeCode(value);
}

export function serializeRosterImportRow(row: NormalizedRosterImportRow) {
  return {
    rowId: row.rowId,
    hostPlatformReferenceId: row.hostPlatformReferenceId,
    playerSourceKey: row.playerSourceKey,
    playerSourcePlayerId: row.playerSourcePlayerId,
    playerExternalId: row.playerExternalId,
    playerName: row.playerName,
    position: row.position,
    teamId: row.teamId,
    teamName: row.teamName,
    teamAbbreviation: row.teamAbbreviation,
    rosterStatus: row.rosterStatus,
    effectiveAt: safeDateIso(row.effectiveAt),
  };
}

export function serializeTransactionImportRow(row: NormalizedTransactionImportRow) {
  return {
    rowId: row.rowId,
    externalReferenceId: row.externalReferenceId,
    transactionType: row.transactionType,
    rawTransactionType: row.rawTransactionType,
    summary: row.summary,
    teamId: row.teamId,
    teamName: row.teamName,
    teamAbbreviation: row.teamAbbreviation,
    playerSourceKey: row.playerSourceKey,
    playerSourcePlayerId: row.playerSourcePlayerId,
    playerExternalId: row.playerExternalId,
    playerName: row.playerName,
    occurredAt: safeDateIso(row.occurredAt),
  };
}
