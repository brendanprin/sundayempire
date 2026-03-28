import { LeaguePhase } from "@prisma/client";

export const CANONICAL_LEAGUE_PHASES: LeaguePhase[] = [
  "PRESEASON_SETUP",
  "ROOKIE_DRAFT",
  "AUCTION_MAIN_DRAFT",
  "REGULAR_SEASON",
  "PLAYOFFS",
  "OFFSEASON_ROLLOVER",
  "TAG_OPTION_COMPLIANCE",
];

export const LEGACY_LEAGUE_PHASES = [
  "PRESEASON",
  "REGULAR_SEASON",
  "PLAYOFFS",
  "OFFSEASON",
] as const;

export type LegacyLeaguePhase = (typeof LEGACY_LEAGUE_PHASES)[number];

const LEGACY_TO_CANONICAL: Record<LegacyLeaguePhase, LeaguePhase> = {
  PRESEASON: "PRESEASON_SETUP",
  REGULAR_SEASON: "REGULAR_SEASON",
  PLAYOFFS: "PLAYOFFS",
  OFFSEASON: "OFFSEASON_ROLLOVER",
};

const CANONICAL_TO_LEGACY: Record<LeaguePhase, LegacyLeaguePhase> = {
  PRESEASON_SETUP: "PRESEASON",
  ROOKIE_DRAFT: "PRESEASON",
  AUCTION_MAIN_DRAFT: "PRESEASON",
  REGULAR_SEASON: "REGULAR_SEASON",
  PLAYOFFS: "PLAYOFFS",
  OFFSEASON_ROLLOVER: "OFFSEASON",
  TAG_OPTION_COMPLIANCE: "OFFSEASON",
};

export function isCanonicalLeaguePhase(value: unknown): value is LeaguePhase {
  return typeof value === "string" && CANONICAL_LEAGUE_PHASES.includes(value as LeaguePhase);
}

export function isLegacyLeaguePhase(value: unknown): value is LegacyLeaguePhase {
  return typeof value === "string" && LEGACY_LEAGUE_PHASES.includes(value as LegacyLeaguePhase);
}

export function normalizeLeaguePhaseInput(value: unknown): LeaguePhase | null {
  if (isCanonicalLeaguePhase(value)) {
    return value;
  }

  if (isLegacyLeaguePhase(value)) {
    return LEGACY_TO_CANONICAL[value];
  }

  return null;
}

export function toLegacyLeaguePhase(phase: LeaguePhase): LegacyLeaguePhase {
  return CANONICAL_TO_LEGACY[phase];
}

export function getNextLeaguePhase(phase: LeaguePhase): LeaguePhase | null {
  const index = CANONICAL_LEAGUE_PHASES.indexOf(phase);
  if (index === -1 || index === CANONICAL_LEAGUE_PHASES.length - 1) {
    return null;
  }

  return CANONICAL_LEAGUE_PHASES[index + 1];
}
