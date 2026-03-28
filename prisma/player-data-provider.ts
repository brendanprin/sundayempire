import { Position } from "@prisma/client";
import {
  PLAYER_POSITION_ORDER,
  normalizeNflTeam,
  normalizeNullableInteger,
  normalizeNullableText,
  normalizePlayerDisplayName,
  normalizePlayerName,
  normalizePlayerPosition,
  normalizePlayerSourceId,
  normalizePlayerSourceKey,
  normalizePlayerStatusCode,
} from "@/lib/domain/player/normalization";

export { PLAYER_POSITION_ORDER } from "@/lib/domain/player/normalization";

export type ProviderPlayerRecord = {
  sourceKey: string;
  sourcePlayerId: string;
  externalId?: string | null;
  name: string;
  displayName?: string | null;
  position: Position;
  nflTeam: string | null;
  age: number | null;
  yearsPro: number | null;
  injuryStatus?: string | null;
  statusCode?: string | null;
  statusText?: string | null;
  isRestricted?: boolean;
};

export type PlayerDataProvider = {
  id: string;
  version: number;
  loadPlayers: () => Promise<ProviderPlayerRecord[]> | ProviderPlayerRecord[];
};

export function normalizeProviderPlayers(players: ProviderPlayerRecord[]): ProviderPlayerRecord[] {
  return players.map((player) => {
    const sourceKey = normalizePlayerSourceKey(player.sourceKey);
    const sourcePlayerId = normalizePlayerSourceId(player.sourcePlayerId);
    const externalId = normalizePlayerSourceId(player.externalId ?? null);
    const name = normalizePlayerName(player.name);

    if (!sourceKey) {
      throw new Error("Provider player record is missing sourceKey.");
    }

    if (!name) {
      throw new Error(
        `Provider player ${sourcePlayerId ?? externalId ?? "<unknown>"} is missing name.`,
      );
    }

    if (!sourcePlayerId) {
      throw new Error(`Provider player ${name} is missing sourcePlayerId.`);
    }

    const displayName = normalizePlayerDisplayName(player.displayName ?? null, name);
    const position = normalizePlayerPosition(player.position);
    const age = normalizeNullableInteger(player.age);
    const yearsPro = normalizeNullableInteger(player.yearsPro);

    return {
      sourceKey,
      sourcePlayerId,
      externalId,
      name,
      displayName,
      position,
      nflTeam: normalizeNflTeam(player.nflTeam),
      age,
      yearsPro,
      injuryStatus: normalizeNullableText(player.injuryStatus ?? null),
      statusCode: normalizePlayerStatusCode(player.statusCode ?? null),
      statusText: normalizeNullableText(player.statusText ?? null),
      isRestricted: player.isRestricted ?? false,
    };
  });
}
