import { RosterStatus, TransactionType } from "@prisma/client";
import { parseCsvRows } from "@/lib/player-import";
import {
  normalizePlayerSourceId,
  normalizePlayerSourceKey,
} from "@/lib/domain/player/normalization";
import type {
  NormalizedRosterImportRow,
  NormalizedTransactionImportRow,
  ParsedSyncImport,
  SyncAdapterPayload,
  SyncImportEnvelope,
  SyncImportFormat,
  SyncProviderAdapter,
} from "@/lib/domain/sync/adapters/types";

const VALID_ROSTER_STATUSES = new Set<RosterStatus>(["ACTIVE", "IR", "RELEASED", "MIRRORED_ONLY"]);
const VALID_TRANSACTION_TYPES = new Set<TransactionType>([
  "ADD",
  "DROP",
  "WAIVER_ADD",
  "WAIVER_DROP",
  "TRADE_IN",
  "TRADE_OUT",
  "CONTRACT_CREATE",
  "CONTRACT_UPDATE",
  "CONTRACT_OPTION_EXERCISED",
  "FRANCHISE_TAG_APPLIED",
  "ROSTER_MOVE",
  "PICK_TRANSFER",
  "COMMISSIONER_OVERRIDE",
  "OFFSEASON_ROLLOVER",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toRecordRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function detectFormat(input: SyncImportEnvelope | null | undefined): SyncImportFormat {
  if (input?.format === "csv") {
    return "csv";
  }

  if (typeof input?.csv === "string") {
    return "csv";
  }

  return "json";
}

function parseEnvelope(input: SyncImportEnvelope | null | undefined): {
  format: SyncImportFormat;
  rawRows: Record<string, unknown>[];
  requestError: string | null;
} {
  const format = detectFormat(input);

  if (format === "csv") {
    if (typeof input?.csv !== "string") {
      return {
        format,
        rawRows: [],
        requestError: "CSV import requires a csv string payload.",
      };
    }

    const rawRows = parseCsvRows(input.csv);
    if (rawRows.length === 0) {
      return {
        format,
        rawRows,
        requestError: "No import rows were provided.",
      };
    }

    return { format, rawRows, requestError: null };
  }

  const rawRows = toRecordRows(input?.rows);
  if (rawRows.length === 0) {
    return {
      format,
      rawRows,
      requestError: "JSON import requires rows as an array of objects.",
    };
  }

  return { format, rawRows, requestError: null };
}

function readString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function readNullableString(row: Record<string, unknown>, keys: string[]) {
  const value = readString(row, keys);
  return value.length > 0 ? value : null;
}

function parseDateOrNull(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeRosterStatus(raw: string | null): RosterStatus {
  if (!raw) {
    return "ACTIVE";
  }

  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "BENCH") {
    return "ACTIVE";
  }
  if (VALID_ROSTER_STATUSES.has(normalized as RosterStatus)) {
    return normalized as RosterStatus;
  }

  return "ACTIVE";
}

function normalizeTransactionType(raw: string | null): TransactionType | null {
  if (!raw) {
    return null;
  }

  const normalized = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (VALID_TRANSACTION_TYPES.has(normalized as TransactionType)) {
    return normalized as TransactionType;
  }

  return null;
}

function parseRosterImport(
  input: SyncImportEnvelope | null | undefined,
): ParsedSyncImport<NormalizedRosterImportRow> | null {
  if (!input) {
    return null;
  }

  const parsed = parseEnvelope(input);
  if (parsed.requestError) {
    return {
      format: parsed.format,
      rawRows: parsed.rawRows,
      rows: [],
      errors: [],
      warnings: [],
      requestError: parsed.requestError,
    };
  }

  const rows: NormalizedRosterImportRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  parsed.rawRows.forEach((row, index) => {
    const playerName = readString(row, ["playerName", "name", "player"]);
    if (!playerName) {
      errors.push(`Roster row ${index + 1}: playerName is required.`);
      return;
    }

    const normalized = {
      rowId:
        readNullableString(row, ["rowId", "id", "referenceId"]) ??
        `roster-row-${index + 1}`,
      hostPlatformReferenceId: readNullableString(row, [
        "hostPlatformReferenceId",
        "referenceId",
        "hostRef",
        "externalRosterId",
      ]),
      playerSourceKey: normalizePlayerSourceKey(
        readNullableString(row, ["playerSourceKey", "sourceKey", "provider", "providerKey"]),
      ),
      playerSourcePlayerId: normalizePlayerSourceId(
        readNullableString(row, [
          "playerSourcePlayerId",
          "sourcePlayerId",
          "providerPlayerId",
          "playerSourceId",
        ]),
      ),
      playerExternalId: readNullableString(row, [
        "playerExternalId",
        "externalPlayerId",
        "playerId",
      ]),
      playerName,
      position: readNullableString(row, ["position"]),
      teamId: readNullableString(row, ["teamId"]),
      teamName: readNullableString(row, ["teamName", "team"]),
      teamAbbreviation: readNullableString(row, ["teamAbbreviation", "abbreviation"]),
      rosterStatus: normalizeRosterStatus(readNullableString(row, ["rosterStatus", "status"])),
      effectiveAt: parseDateOrNull(readNullableString(row, ["effectiveAt", "occurredAt", "createdAt"])),
      raw: row,
    } satisfies NormalizedRosterImportRow;

    if (
      !(normalized.playerSourceKey && normalized.playerSourcePlayerId) &&
      !normalized.playerExternalId &&
      !normalized.position
    ) {
      warnings.push(
        `Roster row ${index + 1}: player source identity, playerExternalId, or position is recommended for deterministic player matching.`,
      );
    }

    if (!normalized.teamId && !normalized.teamName && !normalized.teamAbbreviation) {
      warnings.push(`Roster row ${index + 1}: no team identifier was provided.`);
    }

    rows.push(normalized);
  });

  return {
    format: parsed.format,
    rawRows: parsed.rawRows,
    rows,
    errors,
    warnings,
    requestError: null,
  };
}

function parseTransactionImport(
  input: SyncImportEnvelope | null | undefined,
): ParsedSyncImport<NormalizedTransactionImportRow> | null {
  if (!input) {
    return null;
  }

  const parsed = parseEnvelope(input);
  if (parsed.requestError) {
    return {
      format: parsed.format,
      rawRows: parsed.rawRows,
      rows: [],
      errors: [],
      warnings: [],
      requestError: parsed.requestError,
    };
  }

  const rows: NormalizedTransactionImportRow[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  parsed.rawRows.forEach((row, index) => {
    const summary = readString(row, ["summary", "description", "details"]);
    if (!summary) {
      errors.push(`Transaction row ${index + 1}: summary is required.`);
      return;
    }

    const rawType = readNullableString(row, ["transactionType", "type"]);

    const normalized = {
      rowId:
        readNullableString(row, ["rowId", "id", "referenceId"]) ??
        `transaction-row-${index + 1}`,
      externalReferenceId: readNullableString(row, ["referenceId", "externalReferenceId"]),
      transactionType: normalizeTransactionType(rawType),
      rawTransactionType: rawType,
      summary,
      teamId: readNullableString(row, ["teamId"]),
      teamName: readNullableString(row, ["teamName", "team"]),
      teamAbbreviation: readNullableString(row, ["teamAbbreviation", "abbreviation"]),
      playerSourceKey: normalizePlayerSourceKey(
        readNullableString(row, ["playerSourceKey", "sourceKey", "provider", "providerKey"]),
      ),
      playerSourcePlayerId: normalizePlayerSourceId(
        readNullableString(row, [
          "playerSourcePlayerId",
          "sourcePlayerId",
          "providerPlayerId",
          "playerSourceId",
        ]),
      ),
      playerExternalId: readNullableString(row, [
        "playerExternalId",
        "externalPlayerId",
        "playerId",
      ]),
      playerName: readNullableString(row, ["playerName", "name", "player"]),
      occurredAt: parseDateOrNull(readNullableString(row, ["occurredAt", "createdAt"])),
      raw: row,
    } satisfies NormalizedTransactionImportRow;

    if (!normalized.transactionType && rawType) {
      warnings.push(
        `Transaction row ${index + 1}: transaction type "${rawType}" does not map cleanly to Dynasty transaction types.`,
      );
    }

    rows.push(normalized);
  });

  return {
    format: parsed.format,
    rawRows: parsed.rawRows,
    rows,
    errors,
    warnings,
    requestError: null,
  };
}

export const csvManualSyncAdapter: SyncProviderAdapter = {
  key: "csv-manual",
  label: "CSV / Manual Snapshot",
  capabilities: {
    rosterImport: true,
    transactionImport: true,
    bidirectionalRosterComparison: true,
    bidirectionalTransactionComparison: false,
  },

  parse(input): SyncAdapterPayload {
    const roster = parseRosterImport(input.roster ?? null);
    const transactions = parseTransactionImport(input.transactions ?? null);
    const warnings = [
      ...(roster?.warnings ?? []),
      ...(transactions?.warnings ?? []),
    ];

    if (transactions) {
      warnings.push(
        "CSV/manual transaction imports are treated as source rows for deterministic comparison. Missing-in-host transaction inference is disabled for this adapter.",
      );
    }

    return {
      adapterKey: this.key,
      sourceLabel: input.sourceLabel ?? this.label,
      capabilities: this.capabilities,
      roster,
      transactions,
      warnings,
    };
  },
};
