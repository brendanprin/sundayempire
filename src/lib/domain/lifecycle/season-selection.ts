import { SeasonStatus } from "@prisma/client";

export type SeasonSummary = {
  id: string;
  year: number;
  status: SeasonStatus;
};

export function selectPreferredSeason<T extends SeasonSummary>(seasons: T[]) {
  const activeSeasons = seasons
    .filter((season) => season.status === "ACTIVE")
    .sort((left, right) => right.year - left.year);

  if (activeSeasons.length > 0) {
    return activeSeasons[0];
  }

  return [...seasons].sort((left, right) => right.year - left.year)[0] ?? null;
}

export function getStrictActiveSeason<T extends SeasonSummary>(seasons: T[]) {
  const activeSeasons = seasons.filter((season) => season.status === "ACTIVE");
  if (activeSeasons.length !== 1) {
    return null;
  }

  return activeSeasons[0];
}
