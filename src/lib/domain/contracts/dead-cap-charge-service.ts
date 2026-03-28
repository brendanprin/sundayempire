import { DeadCapSourceEventType } from "@prisma/client";
import { computeDeadCapSchedule } from "@/lib/domain/contracts/dead-cap-calculator";
import { ContractDbClient, isPlayerRetired } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

type CandidateContract = {
  id: string;
  seasonId: string;
  status: string;
};

export type DeadCapBackfillGap = {
  penaltyId: string;
  reason:
    | "MISSING_PLAYER"
    | "MISSING_SOURCE_CONTRACT"
    | "AMBIGUOUS_SOURCE_CONTRACT"
    | "TARGET_SEASON_MISSING";
  details?: Record<string, unknown>;
};

function legacyPenaltyReason(contractId: string) {
  return `Dead cap charge for contract ${contractId}`;
}

function pickBackfillContract(candidates: CandidateContract[]) {
  if (candidates.length === 1) {
    return candidates[0];
  }

  const closedCandidates = candidates.filter(
    (candidate) => candidate.status === "TERMINATED" || candidate.status === "EXPIRED",
  );

  if (closedCandidates.length === 1) {
    return closedCandidates[0];
  }

  return null;
}

export function createDeadCapChargeService(client: ContractDbClient = prisma) {
  return {
    async ensureLegacyDeadCapCoverage(input: {
      leagueId: string;
      teamId: string;
      seasonId: string;
    }) {
      const penalties = await client.capPenalty.findMany({
        where: {
          teamId: input.teamId,
          seasonId: input.seasonId,
        },
        select: {
          id: true,
          playerId: true,
          amount: true,
          reason: true,
          seasonId: true,
          teamId: true,
        },
      });

      const gaps: DeadCapBackfillGap[] = [];
      let createdCount = 0;

      for (const penalty of penalties) {
        if (!penalty.playerId) {
          gaps.push({
            penaltyId: penalty.id,
            reason: "MISSING_PLAYER",
            details: {
              legacyReason: penalty.reason,
            },
          });
          continue;
        }

        const candidates = await client.contract.findMany({
          where: {
            teamId: penalty.teamId,
            playerId: penalty.playerId,
          },
          select: {
            id: true,
            seasonId: true,
            status: true,
          },
          orderBy: [{ createdAt: "desc" }],
        });
        const sourceContract = pickBackfillContract(candidates);

        if (!sourceContract) {
          gaps.push({
            penaltyId: penalty.id,
            reason:
              candidates.length === 0 ? "MISSING_SOURCE_CONTRACT" : "AMBIGUOUS_SOURCE_CONTRACT",
            details: {
              playerId: penalty.playerId,
              candidateCount: candidates.length,
              legacyReason: penalty.reason,
            },
          });
          continue;
        }

        const existingCharge = await client.deadCapCharge.findUnique({
          where: {
            sourceContractId_appliesToSeasonId_sourceEventType: {
              sourceContractId: sourceContract.id,
              appliesToSeasonId: penalty.seasonId,
              sourceEventType: DeadCapSourceEventType.CUT,
            },
          },
          select: {
            id: true,
          },
        });

        if (existingCharge) {
          continue;
        }

        await client.deadCapCharge.create({
          data: {
            leagueId: input.leagueId,
            teamId: penalty.teamId,
            playerId: penalty.playerId,
            sourceContractId: sourceContract.id,
            sourceEventType: DeadCapSourceEventType.CUT,
            appliesToSeasonId: penalty.seasonId,
            systemCalculatedAmount: penalty.amount,
            adjustedAmount: penalty.amount,
            isOverride: true,
            overrideReason: "Backfilled from legacy CapPenalty; exact formula reconstruction unavailable.",
          },
        });
        createdCount += 1;
      }

      return {
        createdCount,
        gaps,
      };
    },
    async applyCutDeadCap(input: {
      leagueId: string;
      teamId: string;
      seasonId: string;
      contractId: string;
      playerId: string;
      playerInjuryStatus?: string | null;
      createdByUserId?: string | null;
      afterTradeDeadline?: boolean;
      asOf?: Date;
    }) {
      const asOf = input.asOf ?? new Date();
      const contract = await client.contract.findUnique({
        where: { id: input.contractId },
        select: {
          id: true,
          seasonId: true,
          teamId: true,
          playerId: true,
          salary: true,
          yearsRemaining: true,
          status: true,
        },
      });

      if (!contract) {
        throw new Error("CONTRACT_NOT_FOUND");
      }

      const season = await client.season.findUnique({
        where: { id: input.seasonId },
        select: {
          id: true,
          leagueId: true,
          year: true,
        },
      });

      if (!season) {
        throw new Error("SEASON_NOT_FOUND");
      }

      const orderedSeasons = await client.season.findMany({
        where: {
          leagueId: season.leagueId,
          year: {
            gte: season.year,
          },
        },
        select: {
          id: true,
          year: true,
        },
        orderBy: {
          year: "asc",
        },
      });
      const seasonIdsByOffset = orderedSeasons.slice(0, 3).map((row) => row.id);

      const schedule = computeDeadCapSchedule({
        annualSalary: contract.salary,
        yearsRemaining: contract.yearsRemaining,
        afterTradeDeadline: input.afterTradeDeadline ?? false,
        retired: isPlayerRetired(input.playerInjuryStatus),
      });

      const skippedOffsets = schedule
        .filter((entry) => !seasonIdsByOffset[entry.seasonOffset])
        .map((entry) => entry.seasonOffset);

      for (const entry of schedule) {
        const appliesToSeasonId = seasonIdsByOffset[entry.seasonOffset];
        if (!appliesToSeasonId) {
          continue;
        }

        await client.deadCapCharge.upsert({
          where: {
            sourceContractId_appliesToSeasonId_sourceEventType: {
              sourceContractId: contract.id,
              appliesToSeasonId,
              sourceEventType: DeadCapSourceEventType.CUT,
            },
          },
          update: {
            systemCalculatedAmount: entry.amount,
            adjustedAmount: null,
            isOverride: false,
            overrideReason: null,
            createdByUserId: input.createdByUserId ?? null,
          },
          create: {
            leagueId: input.leagueId,
            teamId: input.teamId,
            playerId: input.playerId,
            sourceContractId: contract.id,
            sourceEventType: DeadCapSourceEventType.CUT,
            appliesToSeasonId,
            systemCalculatedAmount: entry.amount,
            adjustedAmount: null,
            isOverride: false,
            overrideReason: null,
            createdByUserId: input.createdByUserId ?? null,
          },
        });

        const reason = legacyPenaltyReason(contract.id);
        await client.capPenalty.deleteMany({
          where: {
            seasonId: appliesToSeasonId,
            teamId: input.teamId,
            playerId: input.playerId,
            reason,
          },
        });

        await client.capPenalty.create({
          data: {
            seasonId: appliesToSeasonId,
            teamId: input.teamId,
            playerId: input.playerId,
            amount: entry.amount,
            reason,
          },
        });
      }

      return {
        chargeCount: schedule.length - skippedOffsets.length,
        skippedOffsets,
        retired: isPlayerRetired(input.playerInjuryStatus),
      };
    },
  };
}
