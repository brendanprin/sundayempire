import fs from "node:fs";
import path from "node:path";
import { Position } from "@prisma/client";

const CSV_RELATIVE_PATH = path.join("prisma", "data", "fantasypros-draft-rankings.csv");

export const FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID = "fantasypros-draft-rankings";
export const FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION = 1;

export type FantasyProsDraftRanking = {
  overallRank: number;
  tier: number;
  name: string;
  nflTeam: string | null;
  position: Position;
  positionRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: number | null;
  standardDeviation: number | null;
  ecrVsAdp: number | null;
};

let cachedRankings: FantasyProsDraftRanking[] | null = null;

function resolveCsvPath() {
  return path.join(process.cwd(), CSV_RELATIVE_PATH);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (isQuoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        isQuoted = !isQuoted;
      }
      continue;
    }

    if (character === "," && !isQuoted) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function findColumn(columns: string[], labels: string[]) {
  for (const label of labels) {
    const index = columns.indexOf(label);
    if (index !== -1) {
      return index;
    }
  }

  return -1;
}

function requireColumn(columns: string[], labels: string[]) {
  const index = findColumn(columns, labels);
  if (index === -1) {
    throw new Error(`FantasyPros draft rankings CSV is missing required column "${labels[0]}".`);
  }
  return index;
}

function parseNullableNumber(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "-") {
    return null;
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseInteger(value: string, label: string) {
  const parsed = parseNullableNumber(value);
  if (parsed === null || !Number.isInteger(parsed)) {
    throw new Error(`FantasyPros draft rankings row is missing a valid ${label}.`);
  }
  return parsed;
}

function roundToSingleDecimal(value: number) {
  return Number.parseFloat(value.toFixed(1));
}

function parsePosition(value: string) {
  const normalized = value.trim().toUpperCase();
  const match = /^(QB|RB|WR|TE|K|DST)(\d+)?$/.exec(normalized);

  if (!match) {
    throw new Error(`FantasyPros draft rankings row has unsupported position "${value}".`);
  }

  return {
    position: match[1] as Position,
    positionRank: match[2] ? Number.parseInt(match[2], 10) : null,
  };
}

function normalizeNflTeam(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "FA") {
    return null;
  }
  return normalized;
}

function normalizeLookupValue(value: string | null) {
  return (value ?? "FA")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function slugify(value: string) {
  const normalized = normalizeLookupValue(value).toLowerCase().replace(/\s+/g, "-");
  return normalized || "player";
}

function deriveTierFromOverallRank(overallRank: number) {
  return Math.floor((overallRank - 1) / 12) + 1;
}

function computeStandardDeviation(values: number[]) {
  if (values.length < 2) {
    return null;
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;

  return roundToSingleDecimal(Math.sqrt(variance));
}

function parseRealTimeRank(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized === "-") {
    return {
      rank: null,
      delta: null,
    };
  }

  const match = /^(\d+)(?:\s+([+-]\d+))?$/.exec(normalized);
  if (!match) {
    return {
      rank: parseNullableNumber(normalized),
      delta: null,
    };
  }

  return {
    rank: Number.parseInt(match[1], 10),
    delta: match[2] ? Number.parseInt(match[2], 10) : null,
  };
}

type RankingRowParser = (row: string[]) => FantasyProsDraftRanking | null;

function buildExpertConsensusParser(header: string[]): RankingRowParser {
  const columnIndexes = {
    overallRank: requireColumn(header, ["RK"]),
    tier: requireColumn(header, ["TIERS"]),
    name: requireColumn(header, ["PLAYER NAME"]),
    nflTeam: requireColumn(header, ["TEAM"]),
    position: requireColumn(header, ["POS"]),
    bestRank: requireColumn(header, ["BEST"]),
    worstRank: requireColumn(header, ["WORST"]),
    averageRank: requireColumn(header, ["AVG.", "AVG"]),
    standardDeviation: requireColumn(header, ["STD.DEV", "STDDEV"]),
    ecrVsAdp: requireColumn(header, ["ECR VS. ADP"]),
  };

  return (row) => {
    if (!row[columnIndexes.overallRank]?.trim()) {
      return null;
    }

    const { position, positionRank } = parsePosition(row[columnIndexes.position] ?? "");
    return {
      overallRank: parseInteger(row[columnIndexes.overallRank] ?? "", "overall rank"),
      tier: parseInteger(row[columnIndexes.tier] ?? "", "tier"),
      name: (row[columnIndexes.name] ?? "").trim(),
      nflTeam: normalizeNflTeam(row[columnIndexes.nflTeam] ?? ""),
      position,
      positionRank,
      bestRank: parseNullableNumber(row[columnIndexes.bestRank] ?? ""),
      worstRank: parseNullableNumber(row[columnIndexes.worstRank] ?? ""),
      averageRank: parseNullableNumber(row[columnIndexes.averageRank] ?? ""),
      standardDeviation: parseNullableNumber(row[columnIndexes.standardDeviation] ?? ""),
      ecrVsAdp: parseNullableNumber(row[columnIndexes.ecrVsAdp] ?? ""),
    };
  };
}

function buildOverallAdpParser(header: string[]): RankingRowParser {
  const columnIndexes = {
    overallRank: requireColumn(header, ["Rank"]),
    name: requireColumn(header, ["Player"]),
    nflTeam: requireColumn(header, ["Team"]),
    position: requireColumn(header, ["POS"]),
    sleeper: requireColumn(header, ["Sleeper"]),
    rtSports: requireColumn(header, ["RTSports"]),
    averageRank: requireColumn(header, ["AVG"]),
    realTime: requireColumn(header, ["Real-Time (?)"]),
  };

  return (row) => {
    if (!row[columnIndexes.overallRank]?.trim()) {
      return null;
    }

    const overallRank = parseInteger(row[columnIndexes.overallRank] ?? "", "overall rank");
    const { position, positionRank } = parsePosition(row[columnIndexes.position] ?? "");
    const realTime = parseRealTimeRank(row[columnIndexes.realTime] ?? "");
    const sourceRanks = [
      parseNullableNumber(row[columnIndexes.sleeper] ?? ""),
      parseNullableNumber(row[columnIndexes.rtSports] ?? ""),
      realTime.rank,
    ].filter((value): value is number => value !== null);

    return {
      overallRank,
      tier: deriveTierFromOverallRank(overallRank),
      name: (row[columnIndexes.name] ?? "").trim(),
      nflTeam: normalizeNflTeam(row[columnIndexes.nflTeam] ?? ""),
      position,
      positionRank,
      bestRank: sourceRanks.length > 0 ? Math.min(...sourceRanks) : null,
      worstRank: sourceRanks.length > 0 ? Math.max(...sourceRanks) : null,
      averageRank: parseNullableNumber(row[columnIndexes.averageRank] ?? ""),
      standardDeviation: computeStandardDeviation(sourceRanks),
      ecrVsAdp: realTime.delta,
    };
  };
}

function buildRankingRowParser(header: string[]): RankingRowParser {
  if (findColumn(header, ["RK"]) !== -1 && findColumn(header, ["PLAYER NAME"]) !== -1) {
    return buildExpertConsensusParser(header);
  }

  if (findColumn(header, ["Rank"]) !== -1 && findColumn(header, ["Player"]) !== -1) {
    return buildOverallAdpParser(header);
  }

  throw new Error("FantasyPros draft rankings CSV format is not supported.");
}

export function fantasyProsSeedExternalIdPrefix(
  version = FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION,
) {
  return `${FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID}-v${version}-`;
}

export function fantasyProsSeedExternalIdForRanking(
  ranking: FantasyProsDraftRanking,
  version = FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION,
) {
  return `${fantasyProsSeedExternalIdPrefix(version)}${String(ranking.overallRank).padStart(4, "0")}-${slugify(
    ranking.name,
  )}`;
}

export function fantasyProsDraftRankingLookupKey(input: {
  name: string;
  nflTeam: string | null;
  position: Position;
}) {
  return [
    normalizeLookupValue(input.name),
    normalizeLookupValue(input.nflTeam),
    input.position,
  ].join("|");
}

export function loadFantasyProsDraftRankings(forceReload = false) {
  if (cachedRankings && !forceReload) {
    return cachedRankings;
  }

  const csvText = fs.readFileSync(resolveCsvPath(), "utf8");
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    throw new Error("FantasyPros draft rankings CSV is empty.");
  }

  const header = parseCsvLine(lines[0]);
  const parseRankingRow = buildRankingRowParser(header);
  const rankings: FantasyProsDraftRanking[] = [];
  const seenLookupKeys = new Set<string>();

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const ranking = parseRankingRow(row);
    if (!ranking) {
      continue;
    }

    if (!ranking.name) {
      throw new Error(`FantasyPros draft rankings row ${ranking.overallRank} is missing a player name.`);
    }

    const lookupKey = fantasyProsDraftRankingLookupKey(ranking);
    if (seenLookupKeys.has(lookupKey)) {
      throw new Error(`FantasyPros draft rankings contain a duplicate entry for ${ranking.name}.`);
    }

    seenLookupKeys.add(lookupKey);
    rankings.push(ranking);
  }

  cachedRankings = rankings;
  return rankings;
}

export function buildFantasyProsDraftRankingLookup(
  rankings = loadFantasyProsDraftRankings(),
) {
  return new Map(
    rankings.map((ranking) => [fantasyProsDraftRankingLookupKey(ranking), ranking] as const),
  );
}
