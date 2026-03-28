import type { Position, Prisma } from "@prisma/client";
import type { NormalizedPlayerDirectoryRow } from "@/lib/domain/player/adapters/types";
import { normalizePlayerSearchName } from "@/lib/domain/player/normalization";

export type RefreshMatchStrategy =
  | "source_identity"
  | "approved_mapping"
  | "legacy_external_id"
  | "exact_name_position_team"
  | "exact_name_position"
  | "new";

export type RefreshablePlayerRecord = {
  id: string;
  sourceKey: string | null;
  sourcePlayerId: string | null;
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
};

export type PersistablePlayerData = Omit<RefreshablePlayerRecord, "id">;

export function serializePersistedJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export function normalizeIncomingPlayerData(
  row: NormalizedPlayerDirectoryRow,
  existingPlayer: RefreshablePlayerRecord | null,
  strategy: RefreshMatchStrategy,
): PersistablePlayerData {
  const searchName = normalizePlayerSearchName(row.searchName || row.displayName || row.name);

  const shouldPreservePrimarySource =
    strategy === "approved_mapping" &&
    existingPlayer?.sourceKey &&
    existingPlayer?.sourcePlayerId;

  return {
    sourceKey: shouldPreservePrimarySource ? existingPlayer?.sourceKey ?? null : row.sourceKey,
    sourcePlayerId: shouldPreservePrimarySource
      ? existingPlayer?.sourcePlayerId ?? null
      : row.sourcePlayerId,
    externalId: row.externalId ?? existingPlayer?.externalId ?? null,
    name: row.name,
    displayName: row.displayName,
    searchName,
    position: row.position,
    nflTeam: row.nflTeam,
    age: row.age,
    yearsPro: row.yearsPro,
    injuryStatus: row.injuryStatus,
    statusCode: row.statusCode,
    statusText: row.statusText,
    isRestricted: row.isRestricted,
  };
}

export function diffPlayerData(
  player: RefreshablePlayerRecord,
  next: PersistablePlayerData,
) {
  const changedFields = Object.entries(next).reduce<string[]>((fields, [key, value]) => {
    const currentValue = (player as Record<string, unknown>)[key];
    if (currentValue !== value) {
      fields.push(key);
    }
    return fields;
  }, []);

  return {
    changedFields,
    isChanged: changedFields.length > 0,
  };
}

export function buildAppliedPlayerSummary(
  playerId: string,
  data: PersistablePlayerData,
) {
  return {
    playerId,
    ...data,
  };
}
