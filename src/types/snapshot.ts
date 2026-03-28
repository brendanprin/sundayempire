export const SNAPSHOT_VERSION = 1;

export type SnapshotValidationFinding = {
  code: string;
  message: string;
  path?: string;
};

export type SnapshotEntityCounts = {
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

export type LeagueSnapshotData = {
  [K in keyof SnapshotEntityCounts]: Array<Record<string, unknown>>;
};

export type LeagueSnapshotPayload = {
  version: number;
  exportedAt: string;
  source: {
    leagueId: string;
    seasonId: string;
    seasonYear: number;
  };
  data: LeagueSnapshotData;
};

export type SnapshotImportRequest = {
  mode?: unknown;
  replaceExisting?: unknown;
  previewHash?: unknown;
  snapshot?: unknown;
};

export type SnapshotImportMode = "preview" | "apply";

export type SnapshotCountDelta = {
  current: number;
  incoming: number;
  delta: number;
};

export type SnapshotRestoreImpactSummary = {
  perEntity: {
    [K in keyof SnapshotEntityCounts]: SnapshotCountDelta;
  };
  totals: {
    currentRecords: number;
    incomingRecords: number;
    deltaRecords: number;
    recordsToDelete: number;
    recordsToInsert: number;
  };
  source: {
    snapshotLeagueId: string;
    snapshotSeasonId: string;
    snapshotSeasonYear: number;
    activeLeagueId: string;
    activeSeasonId: string;
    activeSeasonYear: number;
    matchesActiveLeague: boolean;
    matchesActiveSeason: boolean;
  };
};

export type SnapshotPreviewReceipt = {
  snapshotHash: string;
  confirmationPhrase: string;
};

export function isSnapshotImportMode(value: unknown): value is SnapshotImportMode {
  return value === "preview" || value === "apply";
}
