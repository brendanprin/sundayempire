import type { RosterStatus, TransactionType } from "@prisma/client";

export type SyncImportFormat = "json" | "csv";

export type SyncImportEnvelope = {
  format?: unknown;
  rows?: unknown;
  csv?: unknown;
};

export type SyncRunRequestBody = {
  adapterKey?: unknown;
  sourceLabel?: unknown;
  roster?: unknown;
  transactions?: unknown;
};

export type NormalizedRosterImportRow = {
  rowId: string;
  hostPlatformReferenceId: string | null;
  playerSourceKey: string | null;
  playerSourcePlayerId: string | null;
  playerExternalId: string | null;
  playerName: string;
  position: string | null;
  teamId: string | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  rosterStatus: RosterStatus;
  effectiveAt: Date | null;
  raw: Record<string, unknown>;
};

export type NormalizedTransactionImportRow = {
  rowId: string;
  externalReferenceId: string | null;
  transactionType: TransactionType | null;
  rawTransactionType: string | null;
  summary: string;
  teamId: string | null;
  teamName: string | null;
  teamAbbreviation: string | null;
  playerSourceKey: string | null;
  playerSourcePlayerId: string | null;
  playerExternalId: string | null;
  playerName: string | null;
  occurredAt: Date | null;
  raw: Record<string, unknown>;
};

export type SyncAdapterCapabilities = {
  rosterImport: boolean;
  transactionImport: boolean;
  bidirectionalRosterComparison: boolean;
  bidirectionalTransactionComparison: boolean;
};

export type ParsedSyncImport<T> = {
  format: SyncImportFormat;
  rawRows: Record<string, unknown>[];
  rows: T[];
  errors: string[];
  warnings: string[];
  requestError: string | null;
};

export type SyncAdapterPayload = {
  adapterKey: string;
  sourceLabel: string | null;
  capabilities: SyncAdapterCapabilities;
  roster: ParsedSyncImport<NormalizedRosterImportRow> | null;
  transactions: ParsedSyncImport<NormalizedTransactionImportRow> | null;
  warnings: string[];
};

export interface SyncProviderAdapter {
  readonly key: string;
  readonly label: string;
  readonly capabilities: SyncAdapterCapabilities;

  parse(input: {
    sourceLabel?: string | null;
    roster?: SyncImportEnvelope | null;
    transactions?: SyncImportEnvelope | null;
  }): SyncAdapterPayload;
}
