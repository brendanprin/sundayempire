import { ContractStatus, PrismaClient } from "@prisma/client";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { createDeadCapChargeService, DeadCapBackfillGap } from "@/lib/domain/contracts/dead-cap-charge-service";
import { computeFranchiseTagSalary } from "@/lib/domain/contracts/franchise-tag-calculator";
import { resolveContractStatus } from "@/lib/domain/contracts/shared";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";

const prisma = new PrismaClient();

type BackfillGap =
  | {
      category: "franchise_tag";
      contractId: string;
      reason: "MISSING_FROZEN_SNAPSHOT" | "MISSING_PRIOR_SALARY" | "MISSING_MARKET_DATA";
      details?: Record<string, unknown>;
    }
  | {
      category: "dead_cap";
      gap: DeadCapBackfillGap;
    };

async function normalizeContractStatuses() {
  const contracts = await prisma.contract.findMany({
    select: {
      id: true,
      status: true,
      yearsRemaining: true,
      isFranchiseTag: true,
      endedAt: true,
    },
  });

  let updatedCount = 0;
  for (const contract of contracts) {
    const nextStatus = resolveContractStatus({
      status: contract.status,
      yearsRemaining: contract.yearsRemaining,
      isFranchiseTag: contract.isFranchiseTag,
      endedAt: contract.endedAt,
    });

    if (nextStatus !== contract.status) {
      await prisma.contract.update({
        where: { id: contract.id },
        data: {
          status: nextStatus,
        },
      });
      updatedCount += 1;
    }
  }

  return updatedCount;
}

async function backfillContractSeasonLedgers() {
  const ledgerService = createContractLedgerService(prisma);
  const contracts = await prisma.contract.findMany({
    select: {
      id: true,
    },
  });

  for (const contract of contracts) {
    await ledgerService.syncContractLedger(contract.id);
  }

  return contracts.length;
}

async function backfillRookieOptionDecisions() {
  const contracts = await prisma.contract.findMany({
    where: {
      rookieOptionExercised: true,
    },
    include: {
      season: {
        select: {
          leagueId: true,
        },
      },
    },
  });

  const rookieOptionYearsByLeagueId = new Map<string, number>();
  let createdOrUpdated = 0;

  for (const contract of contracts) {
    let rookieOptionYears = rookieOptionYearsByLeagueId.get(contract.season.leagueId) ?? null;
    if (rookieOptionYears === null) {
      const ruleset = await prisma.leagueRuleSet.findFirst({
        where: {
          leagueId: contract.season.leagueId,
          isActive: true,
        },
        orderBy: {
          version: "desc",
        },
        select: {
          rookieOptionYears: true,
        },
      });
      rookieOptionYears = ruleset?.rookieOptionYears ?? Math.max(0, contract.yearsTotal - 1);
      rookieOptionYearsByLeagueId.set(contract.season.leagueId, rookieOptionYears);
    }

    await prisma.contractOptionDecision.upsert({
      where: {
        seasonId_contractId: {
          seasonId: contract.seasonId,
          contractId: contract.id,
        },
      },
      update: {
        decisionType: "EXERCISE",
        effectiveContractYearsAdded: rookieOptionYears,
        decidedAt: contract.updatedAt,
      },
      create: {
        seasonId: contract.seasonId,
        teamId: contract.teamId,
        playerId: contract.playerId,
        contractId: contract.id,
        decisionType: "EXERCISE",
        decidedAt: contract.updatedAt,
        effectiveContractYearsAdded: rookieOptionYears,
      },
    });
    createdOrUpdated += 1;
  }

  return createdOrUpdated;
}

async function resolveFrozenSnapshotSeason(input: {
  leagueId: string;
  seasonId: string;
  seasonYear: number;
  sourceSeasonId: string | null;
}) {
  if (input.sourceSeasonId) {
    const season = await prisma.season.findUnique({
      where: {
        id: input.sourceSeasonId,
      },
      select: {
        id: true,
        year: true,
      },
    });
    if (season) {
      return season;
    }
  }

  return prisma.season.findFirst({
    where: {
      leagueId: input.leagueId,
      year: {
        lt: input.seasonYear,
      },
    },
    orderBy: {
      year: "desc",
    },
    select: {
      id: true,
      year: true,
    },
  });
}

async function backfillFranchiseTagUsages() {
  const taggedContracts = await prisma.contract.findMany({
    where: {
      isFranchiseTag: true,
      status: {
        in: [ContractStatus.TAGGED, ContractStatus.ACTIVE, ContractStatus.EXPIRING],
      },
    },
    include: {
      player: {
        select: {
          position: true,
        },
      },
      season: {
        select: {
          id: true,
          year: true,
          sourceSeasonId: true,
          leagueId: true,
        },
      },
    },
  });

  const gaps: BackfillGap[] = [];
  let createdCount = 0;

  for (const contract of taggedContracts) {
    const existing = await prisma.franchiseTagUsage.findUnique({
      where: {
        seasonId_contractId: {
          seasonId: contract.seasonId,
          contractId: contract.id,
        },
      },
      select: {
        id: true,
      },
    });
    if (existing) {
      continue;
    }

    const frozenSnapshotSeason = await resolveFrozenSnapshotSeason({
      leagueId: contract.season.leagueId,
      seasonId: contract.season.id,
      seasonYear: contract.season.year,
      sourceSeasonId: contract.season.sourceSeasonId,
    });

    if (!frozenSnapshotSeason) {
      gaps.push({
        category: "franchise_tag",
        contractId: contract.id,
        reason: "MISSING_FROZEN_SNAPSHOT",
      });
      continue;
    }

    const previousSalaryContract = await prisma.contract.findFirst({
      where: {
        teamId: contract.teamId,
        playerId: contract.playerId,
        seasonId: frozenSnapshotSeason.id,
      },
      select: {
        salary: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!previousSalaryContract) {
      gaps.push({
        category: "franchise_tag",
        contractId: contract.id,
        reason: "MISSING_PRIOR_SALARY",
        details: {
          frozenSnapshotSeasonId: frozenSnapshotSeason.id,
        },
      });
      continue;
    }

    const comparableContracts = await prisma.contract.findMany({
      where: {
        seasonId: frozenSnapshotSeason.id,
        player: {
          position: contract.player.position,
        },
      },
      select: {
        salary: true,
      },
    });

    if (comparableContracts.length === 0) {
      gaps.push({
        category: "franchise_tag",
        contractId: contract.id,
        reason: "MISSING_MARKET_DATA",
        details: {
          frozenSnapshotSeasonId: frozenSnapshotSeason.id,
        },
      });
      continue;
    }

    let salary: ReturnType<typeof computeFranchiseTagSalary>;
    try {
      salary = computeFranchiseTagSalary({
        position: contract.player.position,
        priorSalary: previousSalaryContract.salary,
        comparableSalaries: comparableContracts.map((entry) => entry.salary),
      });
    } catch (error) {
      gaps.push({
        category: "franchise_tag",
        contractId: contract.id,
        reason: "MISSING_MARKET_DATA",
        details: {
          error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
          frozenSnapshotSeasonId: frozenSnapshotSeason.id,
        },
      });
      continue;
    }

    await prisma.franchiseTagUsage.upsert({
      where: {
        seasonId_contractId: {
          seasonId: contract.seasonId,
          contractId: contract.id,
        },
      },
      update: {
        priorSalary: previousSalaryContract.salary,
        calculatedTopTierAverage: salary.calculatedTopTierAverage,
        calculated120PercentSalary: salary.calculated120PercentSalary,
        finalTagSalary: contract.salary,
        frozenSnapshotSeasonId: frozenSnapshotSeason.id,
      },
      create: {
        seasonId: contract.seasonId,
        teamId: contract.teamId,
        playerId: contract.playerId,
        contractId: contract.id,
        priorSalary: previousSalaryContract.salary,
        calculatedTopTierAverage: salary.calculatedTopTierAverage,
        calculated120PercentSalary: salary.calculated120PercentSalary,
        finalTagSalary: contract.salary,
        frozenSnapshotSeasonId: frozenSnapshotSeason.id,
      },
    });
    createdCount += 1;
  }

  return {
    createdCount,
    gaps,
  };
}

async function backfillDeadCapCharges() {
  const deadCapService = createDeadCapChargeService(prisma);
  const penaltyPairs = await prisma.capPenalty.findMany({
    select: {
      seasonId: true,
      teamId: true,
      season: {
        select: {
          leagueId: true,
        },
      },
    },
  });

  const seen = new Set<string>();
  let createdCount = 0;
  const gaps: BackfillGap[] = [];

  for (const pair of penaltyPairs) {
    const key = `${pair.season.leagueId}:${pair.teamId}:${pair.seasonId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const result = await deadCapService.ensureLegacyDeadCapCoverage({
      leagueId: pair.season.leagueId,
      teamId: pair.teamId,
      seasonId: pair.seasonId,
    });
    createdCount += result.createdCount;
    gaps.push(...result.gaps.map((gap) => ({ category: "dead_cap" as const, gap })));
  }

  return {
    createdCount,
    gaps,
  };
}

async function recalculateTouchedTeamSeasonStates() {
  const contracts = await prisma.contract.findMany({
    select: {
      teamId: true,
      seasonId: true,
    },
  });
  const deadCapCharges = await prisma.deadCapCharge.findMany({
    select: {
      teamId: true,
      appliesToSeasonId: true,
    },
  });

  const touchedPairs = new Set<string>();
  for (const contract of contracts) {
    touchedPairs.add(`${contract.teamId}:${contract.seasonId}`);
  }
  for (const charge of deadCapCharges) {
    touchedPairs.add(`${charge.teamId}:${charge.appliesToSeasonId}`);
  }

  const service = createTeamSeasonStateRecalculationService(prisma);
  for (const pair of touchedPairs) {
    const [teamId, seasonId] = pair.split(":");
    await service.recalculateTeamSeasonState({
      teamId,
      seasonId,
    });
  }

  return touchedPairs.size;
}

async function main() {
  const statusUpdates = await normalizeContractStatuses();
  const ledgerRowsSynced = await backfillContractSeasonLedgers();
  const optionDecisions = await backfillRookieOptionDecisions();
  const franchiseTagResult = await backfillFranchiseTagUsages();
  const deadCapResult = await backfillDeadCapCharges();
  const teamSeasonStates = await recalculateTouchedTeamSeasonStates();

  const destructiveHistoryGaps = deadCapResult.gaps.filter(
    (entry) =>
      entry.category === "dead_cap" &&
      (entry.gap.reason === "MISSING_SOURCE_CONTRACT" || entry.gap.reason === "AMBIGUOUS_SOURCE_CONTRACT"),
  ).length;

  console.log(
    JSON.stringify(
      {
        statusUpdates,
        ledgerRowsSynced,
        optionDecisions,
        franchiseTagUsages: franchiseTagResult.createdCount,
        deadCapCharges: deadCapResult.createdCount,
        teamSeasonStates,
        destructiveHistoryGaps,
        gaps: [...franchiseTagResult.gaps, ...deadCapResult.gaps],
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("[backfill-s3-contract-financial-state] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
