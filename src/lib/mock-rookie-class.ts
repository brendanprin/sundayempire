import fs from "node:fs";
import path from "node:path";
import { Position } from "@prisma/client";

const CSV_RELATIVE_PATH = path.join("prisma", "data", "mock-rookie-class-2026-canonical.csv");
const SUPPORTED_POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE", "K", "DST"]);

export type MockRookieClassRanking = {
  overallRank: number;
  tier: number;
  positionRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
  averageRank: number | null;
  standardDeviation: number | null;
  ecrVsAdp: number | null;
};

export type MockRookieClassPlayer = {
  sourceKey: string;
  sourcePlayerId: string;
  externalId: string | null;
  name: string;
  displayName: string;
  position: Position;
  nflTeam: string | null;
  yearsPro: number | null;
  statusCode: string | null;
  statusText: string | null;
  isRestricted: boolean;
};

type MockRookieClassEntry = {
  sourceKey: string;
  sourcePlayerId: string;
  externalId: string | null;
  name: string;
  displayName: string;
  nflTeam: string | null;
  position: Position;
  yearsPro: number | null;
  statusCode: string | null;
  statusText: string | null;
  isRestricted: boolean;
  overallPick: number;
  round: number;
  isFantasyPosition: boolean;
};

let cachedRankings: Map<string, MockRookieClassRanking> | null = null;

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

function findColumn(columns: string[], label: string) {
  return columns.indexOf(label);
}

function parseInteger(value: string) {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value: string) {
  return value.trim().toLowerCase() === "true";
}

function normalizeLookupValue(value: string | null | undefined) {
  return (value ?? "FA")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function sourceIdentityLookupKey(sourceKey: string | null | undefined, sourcePlayerId: string | null | undefined) {
  const normalizedSourceKey = (sourceKey ?? "").trim().toLowerCase();
  const normalizedSourcePlayerId = (sourcePlayerId ?? "").trim();

  if (!normalizedSourceKey || !normalizedSourcePlayerId) {
    return null;
  }

  return `${normalizedSourceKey}::${normalizedSourcePlayerId}`;
}

function externalIdLookupKey(externalId: string | null | undefined) {
  const normalizedExternalId = (externalId ?? "").trim();
  return normalizedExternalId ? `external::${normalizedExternalId}` : null;
}

function nameTeamPositionLookupKey(input: {
  name?: string | null;
  nflTeam?: string | null;
  position?: string | null;
}) {
  const position = (input.position ?? "").trim().toUpperCase();
  if (!position) {
    return null;
  }

  return [
    normalizeLookupValue(input.name),
    normalizeLookupValue(input.nflTeam),
    position,
  ].join("::");
}

function parseEntries() {
  let csv: string;
  try {
    csv = fs.readFileSync(resolveCsvPath(), "utf8");
  } catch {
    return [];
  }

  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return [];
  }

  const header = parseCsvLine(lines[0]);
  const sourceKeyIndex = findColumn(header, "sourceKey");
  const sourcePlayerIdIndex = findColumn(header, "sourcePlayerId");
  const externalIdIndex = findColumn(header, "externalId");
  const nameIndex = findColumn(header, "name");
  const displayNameIndex = findColumn(header, "displayName");
  const nflTeamIndex = findColumn(header, "nflTeam");
  const positionIndex = findColumn(header, "position");
  const yearsProIndex = findColumn(header, "yearsPro");
  const statusCodeIndex = findColumn(header, "statusCode");
  const statusTextIndex = findColumn(header, "statusText");
  const isRestrictedIndex = findColumn(header, "isRestricted");
  const overallPickIndex = findColumn(header, "overallPick");
  const roundIndex = findColumn(header, "round");
  const isFantasyPositionIndex = findColumn(header, "isFantasyPosition");

  if (
    sourceKeyIndex === -1 ||
    sourcePlayerIdIndex === -1 ||
    externalIdIndex === -1 ||
    nameIndex === -1 ||
    nflTeamIndex === -1 ||
    positionIndex === -1 ||
    overallPickIndex === -1 ||
    roundIndex === -1 ||
    isFantasyPositionIndex === -1
  ) {
    return [];
  }

  const entries: MockRookieClassEntry[] = [];

  for (const line of lines.slice(1)) {
    const row = parseCsvLine(line);
    const position = (row[positionIndex] ?? "").trim().toUpperCase() as Position;
    const overallPick = parseInteger(row[overallPickIndex] ?? "");
    const round = parseInteger(row[roundIndex] ?? "");

    if (!SUPPORTED_POSITIONS.has(position) || overallPick === null || round === null) {
      continue;
    }

    entries.push({
      sourceKey: (row[sourceKeyIndex] ?? "").trim(),
      sourcePlayerId: (row[sourcePlayerIdIndex] ?? "").trim(),
      externalId: (row[externalIdIndex] ?? "").trim() || null,
      name: (row[nameIndex] ?? "").trim(),
      displayName: (row[displayNameIndex] ?? "").trim() || (row[nameIndex] ?? "").trim(),
      nflTeam: (row[nflTeamIndex] ?? "").trim() || null,
      position,
      yearsPro: parseInteger(row[yearsProIndex] ?? ""),
      statusCode: (row[statusCodeIndex] ?? "").trim() || null,
      statusText: (row[statusTextIndex] ?? "").trim() || null,
      isRestricted: parseBoolean(row[isRestrictedIndex] ?? ""),
      overallPick,
      round,
      isFantasyPosition: parseBoolean(row[isFantasyPositionIndex] ?? ""),
    });
  }

  return entries;
}

function buildRankingLookup() {
  const lookup = new Map<string, MockRookieClassRanking>();
  const positionCounts = new Map<Position, number>();
  const entries = parseEntries()
    .filter((entry) => entry.isFantasyPosition)
    .sort((left, right) => left.overallPick - right.overallPick);

  for (const entry of entries) {
    const nextPositionRank = (positionCounts.get(entry.position) ?? 0) + 1;
    positionCounts.set(entry.position, nextPositionRank);

    const ranking: MockRookieClassRanking = {
      overallRank: entry.overallPick,
      tier: entry.round,
      positionRank: nextPositionRank,
      bestRank: null,
      worstRank: null,
      averageRank: null,
      standardDeviation: null,
      ecrVsAdp: null,
    };

    const sourceIdentityKey = sourceIdentityLookupKey(entry.sourceKey, entry.sourcePlayerId);
    if (sourceIdentityKey) {
      lookup.set(sourceIdentityKey, ranking);
    }

    const externalIdKey = externalIdLookupKey(entry.externalId);
    if (externalIdKey) {
      lookup.set(externalIdKey, ranking);
    }

    const nameTeamPositionKey = nameTeamPositionLookupKey(entry);
    if (nameTeamPositionKey) {
      lookup.set(nameTeamPositionKey, ranking);
    }
  }

  return lookup;
}

export function loadMockRookieClassPlayers(): MockRookieClassPlayer[] {
  return parseEntries()
    .filter((entry) => entry.isFantasyPosition)
    .sort((left, right) => left.overallPick - right.overallPick)
    .map((entry) => ({
      sourceKey: entry.sourceKey,
      sourcePlayerId: entry.sourcePlayerId,
      externalId: entry.externalId,
      name: entry.name,
      displayName: entry.displayName,
      position: entry.position,
      nflTeam: entry.nflTeam,
      yearsPro: entry.yearsPro,
      statusCode: entry.statusCode,
      statusText: entry.statusText,
      isRestricted: entry.isRestricted,
    }));
}

function getRankingLookup() {
  if (!cachedRankings) {
    cachedRankings = buildRankingLookup();
  }

  return cachedRankings;
}

export function findMockRookieClassRanking(input: {
  sourceKey?: string | null;
  sourcePlayerId?: string | null;
  externalId?: string | null;
  name?: string | null;
  nflTeam?: string | null;
  position?: string | null;
}) {
  const lookup = getRankingLookup();

  const sourceIdentityKey = sourceIdentityLookupKey(input.sourceKey, input.sourcePlayerId);
  if (sourceIdentityKey) {
    const ranking = lookup.get(sourceIdentityKey);
    if (ranking) {
      return ranking;
    }
  }

  const externalIdKey = externalIdLookupKey(input.externalId);
  if (externalIdKey) {
    const ranking = lookup.get(externalIdKey);
    if (ranking) {
      return ranking;
    }
  }

  const nameTeamPositionKey = nameTeamPositionLookupKey(input);
  return nameTeamPositionKey ? lookup.get(nameTeamPositionKey) ?? null : null;
}
