import { Position } from "@prisma/client";
import {
  normalizeNflTeam,
  normalizeNullableInteger,
  normalizeNullableText,
  normalizePlayerSearchName,
  normalizePlayerStatusCode,
} from "@/lib/domain/player/normalization";
import type {
  NormalizedPlayerDirectoryRow,
  PlayerDirectoryAdapter,
  PlayerDirectoryAdapterResult,
} from "@/lib/domain/player/adapters/types";

const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";
const SOURCE_KEY = "sleeper";

// Only the positions our Position enum supports. Sleeper uses "DEF" for
// team defenses; we store those as "DST".
const SLEEPER_POSITION_MAP: Record<string, Position> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  K: "K",
  DEF: "DST",
};

// Raw shape returned by Sleeper — only the fields we care about.
type SleeperPlayer = {
  player_id: string;
  first_name: string | null | undefined;
  last_name: string | null | undefined;
  full_name: string | null | undefined;
  position: string | null | undefined;
  fantasy_positions: string[] | null | undefined;
  team: string | null | undefined;
  age: number | null | undefined;
  years_exp: number | null | undefined;
  injury_status: string | null | undefined;
  status: string | null | undefined;
};

function buildPlayerName(player: SleeperPlayer): string | null {
  if (player.full_name?.trim()) {
    return player.full_name.trim();
  }

  const first = player.first_name?.trim() ?? "";
  const last = player.last_name?.trim() ?? "";
  const combined = [first, last].filter(Boolean).join(" ");
  return combined.length > 0 ? combined : null;
}

function toDirectoryRow(
  playerId: string,
  player: SleeperPlayer,
  position: Position,
): NormalizedPlayerDirectoryRow {
  const name = buildPlayerName(player) ?? playerId;
  const nflTeam = normalizeNflTeam(player.team);
  const injuryStatus = normalizeNullableText(player.injury_status);
  const rawStatus = normalizeNullableText(player.status);
  const statusCode = normalizePlayerStatusCode(rawStatus);

  return {
    sourceKey: SOURCE_KEY,
    sourcePlayerId: playerId,
    externalId: null,
    name,
    displayName: name,
    searchName: normalizePlayerSearchName(name),
    position,
    nflTeam,
    age: normalizeNullableInteger(player.age),
    yearsPro: normalizeNullableInteger(player.years_exp),
    injuryStatus,
    statusCode,
    statusText: rawStatus,
    isRestricted: false,
    raw: {
      player_id: playerId,
      full_name: player.full_name ?? null,
      first_name: player.first_name ?? null,
      last_name: player.last_name ?? null,
      position: player.position ?? null,
      fantasy_positions: player.fantasy_positions ?? null,
      team: player.team ?? null,
      age: player.age ?? null,
      years_exp: player.years_exp ?? null,
      injury_status: player.injury_status ?? null,
      status: player.status ?? null,
    },
  };
}

function parsePlayers(raw: Record<string, unknown>): {
  rows: NormalizedPlayerDirectoryRow[];
  rawRows: Record<string, unknown>[];
  errors: string[];
  warnings: string[];
} {
  const rows: NormalizedPlayerDirectoryRow[] = [];
  const rawRows: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const [playerId, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== "object") {
      warnings.push(`Skipping player_id "${playerId}": entry is not an object.`);
      continue;
    }

    const player = entry as SleeperPlayer;
    const sleeperPosition = player.position?.trim().toUpperCase() ?? "";
    const mappedPosition = SLEEPER_POSITION_MAP[sleeperPosition];

    // Skip positions we don't track (LB, DB, OL, P, LS, etc.)
    if (!mappedPosition) {
      continue;
    }

    const name = buildPlayerName(player);
    if (!name) {
      warnings.push(`Skipping player_id "${playerId}": could not determine a name.`);
      continue;
    }

    rawRows.push({ player_id: playerId, ...(entry as Record<string, unknown>) });
    rows.push(toDirectoryRow(playerId, player, mappedPosition));
  }

  return { rows, rawRows, errors, warnings };
}

export const sleeperPlayerDirectoryAdapter: PlayerDirectoryAdapter = {
  key: SOURCE_KEY,
  label: "Sleeper NFL Player Directory",

  async read(): Promise<PlayerDirectoryAdapterResult> {
    let raw: Record<string, unknown>;

    try {
      const response = await fetch(SLEEPER_PLAYERS_URL, {
        headers: { "Accept": "application/json" },
        // next.js cache: revalidate daily — Sleeper asks for at most once-per-day calls
        next: { revalidate: 86_400 },
      } as RequestInit);

      if (!response.ok) {
        return {
          adapterKey: SOURCE_KEY,
          sourceLabel: "Sleeper NFL Player Directory",
          format: "json",
          rawRows: [],
          rows: [],
          errors: [],
          warnings: [],
          requestError: `Sleeper API responded with ${response.status} ${response.statusText}.`,
        };
      }

      raw = (await response.json()) as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        adapterKey: SOURCE_KEY,
        sourceLabel: "Sleeper NFL Player Directory",
        format: "json",
        rawRows: [],
        rows: [],
        errors: [],
        warnings: [],
        requestError: `Failed to fetch Sleeper player directory: ${message}`,
      };
    }

    const { rows, rawRows, errors, warnings } = parsePlayers(raw);

    return {
      adapterKey: SOURCE_KEY,
      sourceLabel: "Sleeper NFL Player Directory",
      format: "json",
      rawRows,
      rows,
      errors,
      warnings,
      requestError: null,
    };
  },
};
