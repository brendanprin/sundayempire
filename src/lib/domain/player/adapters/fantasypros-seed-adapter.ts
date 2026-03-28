import { createFantasyProsSeedProvider } from "../../../../../prisma/providers/fantasypros-seed-provider";
import { normalizePlayerSearchName } from "@/lib/domain/player/normalization";
import type {
  NormalizedPlayerDirectoryRow,
  PlayerDirectoryAdapter,
  PlayerDirectoryAdapterResult,
} from "@/lib/domain/player/adapters/types";

function toDirectoryRow(
  row: Awaited<ReturnType<ReturnType<typeof createFantasyProsSeedProvider>["loadPlayers"]>>[number],
): NormalizedPlayerDirectoryRow {
  const displayName = row.displayName ?? row.name;

  return {
    sourceKey: row.sourceKey,
    sourcePlayerId: row.sourcePlayerId,
    externalId: row.externalId ?? null,
    name: row.name,
    displayName,
    searchName: normalizePlayerSearchName(displayName),
    position: row.position,
    nflTeam: row.nflTeam,
    age: row.age,
    yearsPro: row.yearsPro,
    injuryStatus: row.injuryStatus ?? null,
    statusCode: row.statusCode ?? null,
    statusText: row.statusText ?? null,
    isRestricted: row.isRestricted ?? false,
    raw: {
      sourceKey: row.sourceKey,
      sourcePlayerId: row.sourcePlayerId,
      externalId: row.externalId ?? null,
      name: row.name,
      displayName,
      position: row.position,
      nflTeam: row.nflTeam,
      age: row.age,
      yearsPro: row.yearsPro,
      injuryStatus: row.injuryStatus ?? null,
      statusCode: row.statusCode ?? null,
      statusText: row.statusText ?? null,
      isRestricted: row.isRestricted ?? false,
    },
  };
}

export const fantasyProsSeedPlayerDirectoryAdapter: PlayerDirectoryAdapter = {
  key: "fantasypros-seed",
  label: "FantasyPros Seed Player Directory",

  async read(input = {}): Promise<PlayerDirectoryAdapterResult> {
    const provider = createFantasyProsSeedProvider();
    const rows = await provider.loadPlayers();

    return {
      adapterKey: this.key,
      sourceLabel: input.sourceLabel?.trim() || `${provider.id} v${provider.version}`,
      format: "provider",
      rawRows: rows.map((row) => ({ ...row })),
      rows: rows.map((row) => toDirectoryRow(row)),
      errors: [],
      warnings: [],
      requestError: null,
    };
  },
};
