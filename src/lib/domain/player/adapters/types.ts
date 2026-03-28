import { Position } from "@prisma/client";

export type PlayerDirectoryImportFormat = "json" | "csv" | "provider";

export type PlayerDirectoryImportEnvelope = {
  format?: unknown;
  players?: unknown;
  csv?: unknown;
};

export type NormalizedPlayerDirectoryRow = {
  sourceKey: string;
  sourcePlayerId: string;
  externalId: string | null;
  name: string;
  displayName: string;
  searchName: string;
  position: Position;
  nflTeam: string | null;
  age: number | null;
  yearsPro: number | null;
  injuryStatus: string | null;
  statusCode: string | null;
  statusText: string | null;
  isRestricted: boolean;
  raw: Record<string, unknown>;
};

export type PlayerDirectoryAdapterResult = {
  adapterKey: string;
  sourceLabel: string | null;
  format: PlayerDirectoryImportFormat;
  rawRows: Record<string, unknown>[];
  rows: NormalizedPlayerDirectoryRow[];
  errors: string[];
  warnings: string[];
  requestError: string | null;
};

export interface PlayerDirectoryAdapter {
  readonly key: string;
  readonly label: string;

  read(input?: {
    sourceLabel?: string | null;
    payload?: PlayerDirectoryImportEnvelope | null;
  }): Promise<PlayerDirectoryAdapterResult> | PlayerDirectoryAdapterResult;
}
