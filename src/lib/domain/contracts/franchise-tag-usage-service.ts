import { ContractStatus } from "@prisma/client";
import { computeFranchiseTagSalary } from "@/lib/domain/contracts/franchise-tag-calculator";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { ContractDbClient, resolveContractStatus } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

type TaggableContract = {
  id: string;
  seasonId: string;
  teamId: string;
  playerId: string;
  salary: number;
  startYear: number;
  yearsRemaining: number;
  yearsTotal: number;
  isFranchiseTag: boolean;
  status: ContractStatus;
  player: {
    id: string;
    name: string;
    position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
  };
  team: {
    id: string;
    leagueId: string;
  };
  season: {
    id: string;
    year: number;
    sourceSeasonId: string | null;
  };
};

async function resolveFrozenSnapshotSeason(
  client: ContractDbClient,
  season: {
    id: string;
    year: number;
    sourceSeasonId: string | null;
  },
  leagueId: string,
) {
  if (season.sourceSeasonId) {
    const sourceSeason = await client.season.findUnique({
      where: { id: season.sourceSeasonId },
      select: {
        id: true,
        year: true,
      },
    });
    if (sourceSeason) {
      return sourceSeason;
    }
  }

  const previousSeason = await client.season.findFirst({
    where: {
      leagueId,
      year: {
        lt: season.year,
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

  if (previousSeason) {
    return previousSeason;
  }

  return {
    id: season.id,
    year: season.year,
  };
}

export function createFranchiseTagUsageService(client: ContractDbClient = prisma) {
  const ledgerService = createContractLedgerService(client);

  async function loadContract(contractId: string) {
    return client.contract.findUnique({
      where: { id: contractId },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
        team: {
          select: {
            id: true,
            leagueId: true,
          },
        },
        season: {
          select: {
            id: true,
            year: true,
            sourceSeasonId: true,
          },
        },
      },
    }) as Promise<TaggableContract | null>;
  }

  async function previewFranchiseTag(input: { contractId: string }) {
      const contract = await loadContract(input.contractId);
      if (!contract) {
        throw new Error("CONTRACT_NOT_FOUND");
      }

      if (contract.isFranchiseTag) {
        throw new Error("ALREADY_TAGGED");
      }

      if (
        contract.status === ContractStatus.TERMINATED ||
        contract.status === ContractStatus.EXPIRED
      ) {
        throw new Error("FRANCHISE_TAG_NOT_AVAILABLE");
      }

      const existingTag = await client.franchiseTagUsage.findFirst({
        where: {
          seasonId: contract.seasonId,
          teamId: contract.teamId,
        },
        select: {
          id: true,
          contractId: true,
        },
      });
      if (existingTag && existingTag.contractId !== contract.id) {
        throw new Error("FRANCHISE_TAG_ALREADY_USED");
      }

      const frozenSnapshotSeason = await resolveFrozenSnapshotSeason(
        client,
        contract.season,
        contract.team.leagueId,
      );

      const previousTag = await client.franchiseTagUsage.findFirst({
        where: {
          teamId: contract.teamId,
          playerId: contract.playerId,
          season: {
            leagueId: contract.team.leagueId,
            year: frozenSnapshotSeason.year,
          },
        },
        select: {
          id: true,
        },
      });

      const fallbackPreviousTag = previousTag
        ? true
        : await client.contract.findFirst({
            where: {
              teamId: contract.teamId,
              playerId: contract.playerId,
              season: {
                leagueId: contract.team.leagueId,
                year: frozenSnapshotSeason.year,
              },
              isFranchiseTag: true,
            },
            select: {
              id: true,
            },
          });

      if (previousTag || fallbackPreviousTag) {
        throw new Error("FRANCHISE_TAG_CONSECUTIVE_NOT_ALLOWED");
      }

      const previousSalaryContract = await client.contract.findFirst({
        where: {
          teamId: contract.teamId,
          playerId: contract.playerId,
          season: {
            leagueId: contract.team.leagueId,
            year: frozenSnapshotSeason.year,
          },
        },
        select: {
          salary: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const comparableContracts = await client.contract.findMany({
        where: {
          season: {
            id: frozenSnapshotSeason.id,
            leagueId: contract.team.leagueId,
          },
          player: {
            position: contract.player.position,
          },
        },
        select: {
          salary: true,
        },
      });

      const priorSalary = previousSalaryContract?.salary ?? contract.salary;
      const salaryDetails = computeFranchiseTagSalary({
        position: contract.player.position,
        priorSalary,
        comparableSalaries: comparableContracts.map((entry) => entry.salary),
      });

      return {
        contract,
        frozenSnapshotSeasonId: frozenSnapshotSeason.id,
        priorSalary,
        ...salaryDetails,
      };
  }

  async function applyFranchiseTag(input: {
      contractId: string;
      createdByUserId?: string | null;
    }) {
      const preview = await previewFranchiseTag({
        contractId: input.contractId,
      });

      const updatedContract = await client.contract.update({
        where: { id: preview.contract.id },
        data: {
          salary: preview.finalTagSalary,
          yearsTotal: 1,
          yearsRemaining: 1,
          endYear: preview.contract.season.year,
          isFranchiseTag: true,
          status: ContractStatus.TAGGED,
          endedAt: null,
        },
      });

      await client.franchiseTagUsage.upsert({
        where: {
          seasonId_contractId: {
            seasonId: preview.contract.seasonId,
            contractId: preview.contract.id,
          },
        },
        update: {
          priorSalary: preview.priorSalary,
          calculatedTopTierAverage: preview.calculatedTopTierAverage,
          calculated120PercentSalary: preview.calculated120PercentSalary,
          finalTagSalary: preview.finalTagSalary,
          frozenSnapshotSeasonId: preview.frozenSnapshotSeasonId,
          createdByUserId: input.createdByUserId ?? null,
        },
        create: {
          seasonId: preview.contract.seasonId,
          teamId: preview.contract.teamId,
          playerId: preview.contract.playerId,
          contractId: preview.contract.id,
          priorSalary: preview.priorSalary,
          calculatedTopTierAverage: preview.calculatedTopTierAverage,
          calculated120PercentSalary: preview.calculated120PercentSalary,
          finalTagSalary: preview.finalTagSalary,
          frozenSnapshotSeasonId: preview.frozenSnapshotSeasonId,
          createdByUserId: input.createdByUserId ?? null,
        },
      });

      await ledgerService.syncContractLedger(updatedContract.id);

      return {
        contract: {
          ...updatedContract,
          status: resolveContractStatus({
            status: updatedContract.status,
            yearsRemaining: updatedContract.yearsRemaining,
            isFranchiseTag: updatedContract.isFranchiseTag,
            endedAt: updatedContract.endedAt,
          }),
        },
        salary: preview,
      };
  }

  return {
    previewFranchiseTag,
    applyFranchiseTag,
  };
}
