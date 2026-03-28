import { Position } from "@prisma/client";

const TOP_TIER_COUNTS: Partial<Record<Position, number>> = {
  QB: 6,
  RB: 6,
  WR: 9,
  TE: 3,
  DST: 3,
};

export function getFranchiseTagTopTierCount(position: Position) {
  const count = TOP_TIER_COUNTS[position];
  if (!count) {
    throw new Error("FRANCHISE_TAG_POSITION_UNSUPPORTED");
  }
  return count;
}

export function computeFranchiseTagSalary(input: {
  position: Position;
  priorSalary: number;
  comparableSalaries: number[];
}) {
  const topTierCount = getFranchiseTagTopTierCount(input.position);
  const topTierComparableSalaries = [...input.comparableSalaries]
    .sort((left, right) => right - left)
    .slice(0, topTierCount);

  if (topTierComparableSalaries.length === 0) {
    throw new Error("FRANCHISE_TAG_MARKET_DATA_UNAVAILABLE");
  }

  const topTierAverage = Math.ceil(
    topTierComparableSalaries.reduce((total, salary) => total + salary, 0) / topTierComparableSalaries.length,
  );
  const salaryFloor = Math.ceil(input.priorSalary * 1.2);

  return {
    calculatedTopTierAverage: topTierAverage,
    calculated120PercentSalary: salaryFloor,
    finalTagSalary: Math.max(topTierAverage, salaryFloor),
  };
}
