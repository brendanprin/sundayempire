import { LeaguePhase, TransactionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

type RolloverPlan = {
  contractsToCarry: {
    teamId: string;
    playerId: string;
    salary: number;
    yearsTotal: number;
    yearsRemaining: number;
    startYear: number;
    endYear: number;
    isRookieContract: boolean;
    rookieOptionEligible: boolean;
    rookieOptionExercised: boolean;
    isFranchiseTag: boolean;
  }[];
  rosterSlotsToCarry: {
    teamId: string;
    playerId: string;
    slotType: "STARTER" | "BENCH" | "IR" | "TAXI";
    slotLabel: string | null;
    week: number | null;
  }[];
  counts: {
    contractsEvaluated: number;
    carriedContracts: number;
    expiredContracts: number;
    skippedExistingContracts: number;
    carriedRosterSlots: number;
    skippedExistingRosterSlots: number;
  };
};

export type OffseasonRolloverResult = {
  dryRun: boolean;
  sourceSeason: {
    id: string;
    year: number;
    phase: LeaguePhase;
  };
  targetSeason: {
    id: string | null;
    year: number;
    phase: LeaguePhase;
    created: boolean;
  };
  counts: RolloverPlan["counts"];
};

function buildRolloverPlan(input: {
  sourceContracts: {
    teamId: string;
    playerId: string;
    salary: number;
    yearsTotal: number;
    yearsRemaining: number;
    startYear: number;
    endYear: number;
    isRookieContract: boolean;
    rookieOptionEligible: boolean;
    rookieOptionExercised: boolean;
    isFranchiseTag: boolean;
  }[];
  sourceRosterSlots: {
    teamId: string;
    playerId: string;
    slotType: "STARTER" | "BENCH" | "IR" | "TAXI";
    slotLabel: string | null;
    week: number | null;
  }[];
  existingTargetContracts: {
    teamId: string;
    playerId: string;
  }[];
  existingTargetRosterSlots: {
    teamId: string;
    playerId: string;
  }[];
}): RolloverPlan {
  const existingTargetContracts = new Set(
    input.existingTargetContracts.map((contract) => `${contract.teamId}:${contract.playerId}`),
  );
  const existingTargetRosterSlots = new Set(
    input.existingTargetRosterSlots.map((slot) => `${slot.teamId}:${slot.playerId}`),
  );

  const contractsToCarry: RolloverPlan["contractsToCarry"] = [];
  let expiredContracts = 0;
  let skippedExistingContracts = 0;

  for (const contract of input.sourceContracts) {
    if (contract.yearsRemaining <= 1) {
      expiredContracts += 1;
      continue;
    }

    const key = `${contract.teamId}:${contract.playerId}`;
    if (existingTargetContracts.has(key)) {
      skippedExistingContracts += 1;
      continue;
    }

    contractsToCarry.push(contract);
  }

  const eligiblePlayerKeys = new Set(
    input.sourceContracts
      .filter((contract) => contract.yearsRemaining > 1)
      .map((contract) => `${contract.teamId}:${contract.playerId}`),
  );
  const rosterSlotsToCarry: RolloverPlan["rosterSlotsToCarry"] = [];
  let skippedExistingRosterSlots = 0;

  for (const slot of input.sourceRosterSlots) {
    const key = `${slot.teamId}:${slot.playerId}`;
    if (!eligiblePlayerKeys.has(key)) {
      continue;
    }

    if (existingTargetRosterSlots.has(key)) {
      skippedExistingRosterSlots += 1;
      continue;
    }

    rosterSlotsToCarry.push(slot);
  }

  return {
    contractsToCarry,
    rosterSlotsToCarry,
    counts: {
      contractsEvaluated: input.sourceContracts.length,
      carriedContracts: contractsToCarry.length,
      expiredContracts,
      skippedExistingContracts,
      carriedRosterSlots: rosterSlotsToCarry.length,
      skippedExistingRosterSlots,
    },
  };
}

export async function runOffseasonRollover(input: {
  leagueId: string;
  sourceSeasonId: string;
  actor?: string;
  dryRun?: boolean;
}): Promise<OffseasonRolloverResult> {
  const dryRun = Boolean(input.dryRun);

  const sourceSeason = await prisma.season.findFirst({
    where: {
      id: input.sourceSeasonId,
      leagueId: input.leagueId,
    },
  });

  if (!sourceSeason) {
    throw new Error("SEASON_NOT_FOUND");
  }

  const targetSeasonYear = sourceSeason.year + 1;

  if (dryRun) {
    const [targetSeason, sourceContracts, sourceRosterSlots] = await Promise.all([
      prisma.season.findUnique({
        where: {
          leagueId_year: {
            leagueId: input.leagueId,
            year: targetSeasonYear,
          },
        },
      }),
      prisma.contract.findMany({
        where: { seasonId: sourceSeason.id },
        select: {
          teamId: true,
          playerId: true,
          salary: true,
          yearsTotal: true,
          yearsRemaining: true,
          startYear: true,
          endYear: true,
          isRookieContract: true,
          rookieOptionEligible: true,
          rookieOptionExercised: true,
          isFranchiseTag: true,
        },
      }),
      prisma.rosterSlot.findMany({
        where: { seasonId: sourceSeason.id },
        select: {
          teamId: true,
          playerId: true,
          slotType: true,
          slotLabel: true,
          week: true,
        },
      }),
    ]);

    const [existingTargetContracts, existingTargetRosterSlots] = targetSeason
      ? await Promise.all([
          prisma.contract.findMany({
            where: { seasonId: targetSeason.id },
            select: { teamId: true, playerId: true },
          }),
          prisma.rosterSlot.findMany({
            where: { seasonId: targetSeason.id },
            select: { teamId: true, playerId: true },
          }),
        ])
      : [[], []];

    const plan = buildRolloverPlan({
      sourceContracts,
      sourceRosterSlots,
      existingTargetContracts,
      existingTargetRosterSlots,
    });

    return {
      dryRun: true,
      sourceSeason: {
        id: sourceSeason.id,
        year: sourceSeason.year,
        phase: sourceSeason.phase,
      },
      targetSeason: {
        id: targetSeason?.id ?? null,
        year: targetSeasonYear,
        phase: targetSeason?.phase ?? "PRESEASON_SETUP",
        created: !targetSeason,
      },
      counts: plan.counts,
    };
  }

  return prisma.$transaction(async (tx) => {
    const existingTargetSeason = await tx.season.findUnique({
      where: {
        leagueId_year: {
          leagueId: input.leagueId,
          year: targetSeasonYear,
        },
      },
    });

    const targetSeason = existingTargetSeason
      ? existingTargetSeason
      : await tx.season.create({
          data: {
            leagueId: input.leagueId,
            year: targetSeasonYear,
            status: "PLANNED",
            phase: "PRESEASON_SETUP",
            sourceSeasonId: sourceSeason.id,
            regularSeasonWeeks: sourceSeason.regularSeasonWeeks,
            playoffStartWeek: sourceSeason.playoffStartWeek,
            playoffEndWeek: sourceSeason.playoffEndWeek,
          },
        });

    const [sourceContracts, sourceRosterSlots, existingTargetContracts, existingTargetRosterSlots] =
      await Promise.all([
        tx.contract.findMany({
          where: { seasonId: sourceSeason.id },
          select: {
            teamId: true,
            playerId: true,
            salary: true,
            yearsTotal: true,
            yearsRemaining: true,
            startYear: true,
            endYear: true,
            isRookieContract: true,
            rookieOptionEligible: true,
            rookieOptionExercised: true,
            isFranchiseTag: true,
          },
        }),
        tx.rosterSlot.findMany({
          where: { seasonId: sourceSeason.id },
          select: {
            teamId: true,
            playerId: true,
            slotType: true,
            slotLabel: true,
            week: true,
          },
        }),
        tx.contract.findMany({
          where: { seasonId: targetSeason.id },
          select: { teamId: true, playerId: true },
        }),
        tx.rosterSlot.findMany({
          where: { seasonId: targetSeason.id },
          select: { teamId: true, playerId: true },
        }),
      ]);

    const plan = buildRolloverPlan({
      sourceContracts,
      sourceRosterSlots,
      existingTargetContracts,
      existingTargetRosterSlots,
    });

    if (plan.contractsToCarry.length > 0) {
      await tx.contract.createMany({
        data: plan.contractsToCarry.map((contract) => ({
          seasonId: targetSeason.id,
          teamId: contract.teamId,
          playerId: contract.playerId,
          salary: contract.salary,
          yearsTotal: contract.yearsTotal,
          yearsRemaining: contract.yearsRemaining - 1,
          startYear: contract.startYear,
          endYear: contract.endYear,
          isRookieContract: contract.isRookieContract,
          rookieOptionEligible: contract.rookieOptionEligible,
          rookieOptionExercised: contract.rookieOptionExercised,
          isFranchiseTag: contract.isFranchiseTag,
        })),
      });
    }

    if (plan.rosterSlotsToCarry.length > 0) {
      await tx.rosterSlot.createMany({
        data: plan.rosterSlotsToCarry.map((slot) => ({
          seasonId: targetSeason.id,
          teamId: slot.teamId,
          playerId: slot.playerId,
          slotType: slot.slotType,
          slotLabel: slot.slotLabel,
          week: slot.week,
        })),
      });
    }

    await logTransaction(tx, {
      leagueId: input.leagueId,
      seasonId: sourceSeason.id,
      type: TransactionType.OFFSEASON_ROLLOVER,
      summary: `Offseason rollover created ${plan.counts.carriedContracts} carried contracts and expired ${plan.counts.expiredContracts}.`,
      metadata: {
        sourceSeasonId: sourceSeason.id,
        sourceSeasonYear: sourceSeason.year,
        targetSeasonId: targetSeason.id,
        targetSeasonYear: targetSeason.year,
        targetSeasonCreated: !existingTargetSeason,
        counts: plan.counts,
        updatedBy: input.actor ?? "api/commissioner/rollover POST",
      },
    });

    return {
      dryRun: false,
      sourceSeason: {
        id: sourceSeason.id,
        year: sourceSeason.year,
        phase: sourceSeason.phase,
      },
      targetSeason: {
        id: targetSeason.id,
        year: targetSeason.year,
        phase: targetSeason.phase,
        created: !existingTargetSeason,
      },
      counts: plan.counts,
    };
  });
}
