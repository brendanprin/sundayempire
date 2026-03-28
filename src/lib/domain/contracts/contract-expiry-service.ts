import { ContractStatus } from "@prisma/client";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { createRosterAssignmentService } from "@/lib/domain/roster-assignment/service";
import { ContractDbClient } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

function may1DeadlineUtc(seasonYear: number) {
  return new Date(Date.UTC(seasonYear, 4, 1, 0, 0, 0, 0));
}

export function createContractExpiryService(client: ContractDbClient = prisma) {
  return createContractExpiryServiceWithDependencies(client, {
    ledgerService: createContractLedgerService(client),
    rosterAssignmentService: createRosterAssignmentService(client),
  });
}

export function createContractExpiryServiceWithDependencies(
  client: ContractDbClient,
  dependencies: {
    ledgerService: Pick<ReturnType<typeof createContractLedgerService>, "syncContractLedger">;
    rosterAssignmentService: Pick<
      ReturnType<typeof createRosterAssignmentService>,
      "releaseAssignment"
    >;
  },
) {
  const { ledgerService, rosterAssignmentService } = dependencies;

  return {
    async processMay1Expiries(input: {
      seasonId: string;
      asOf?: Date;
    }) {
      const season = await client.season.findUnique({
        where: { id: input.seasonId },
        select: {
          id: true,
          year: true,
        },
      });

      if (!season) {
        throw new Error("SEASON_NOT_FOUND");
      }

      const asOf = input.asOf ?? new Date();
      const deadline = may1DeadlineUtc(season.year);
      if (asOf < deadline) {
        return {
          processed: false,
          deadline,
          expiredContractIds: [] as string[],
        };
      }

      const expiringContracts = await client.contract.findMany({
        where: {
          seasonId: season.id,
          status: {
            in: [ContractStatus.ACTIVE, ContractStatus.EXPIRING, ContractStatus.TAGGED],
          },
          yearsRemaining: {
            lte: 1,
          },
          isFranchiseTag: false,
        },
        select: {
          id: true,
          teamId: true,
          playerId: true,
        },
      });

      for (const contract of expiringContracts) {
        await client.contract.update({
          where: { id: contract.id },
          data: {
            status: ContractStatus.EXPIRED,
            yearsRemaining: 0,
            endedAt: asOf,
          },
        });
        await client.rosterSlot.deleteMany({
          where: {
            seasonId: season.id,
            teamId: contract.teamId,
            playerId: contract.playerId,
          },
        });
        await rosterAssignmentService.releaseAssignment({
          teamId: contract.teamId,
          seasonId: season.id,
          playerId: contract.playerId,
        });
        await ledgerService.syncContractLedger(contract.id);
      }

      return {
        processed: true,
        deadline,
        expiredContractIds: expiringContracts.map((contract) => contract.id),
      };
    },
  };
}
