import { ContractStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ContractDbClient, resolveContractStatus } from "@/lib/domain/contracts/shared";

type ContractLedgerContract = {
  id: string;
  seasonId: string;
  teamId: string;
  playerId: string;
  salary: number;
  yearsRemaining: number;
  isFranchiseTag: boolean;
  status: ContractStatus;
  endedAt: Date | null;
};

export function createContractLedgerService(client: ContractDbClient = prisma) {
  async function upsertLedgerForContract(contract: ContractLedgerContract) {
    const existing = await client.contractSeasonLedger.findUnique({
      where: {
        contractId_seasonId: {
          contractId: contract.id,
          seasonId: contract.seasonId,
        },
      },
      select: {
        id: true,
        yearsRemainingAtStart: true,
      },
    });

    const ledgerStatus = resolveContractStatus({
      status: contract.status,
      yearsRemaining: contract.yearsRemaining,
      isFranchiseTag: contract.isFranchiseTag,
      endedAt: contract.endedAt,
    });

    if (existing) {
      return client.contractSeasonLedger.update({
        where: { id: existing.id },
        data: {
          annualSalary: contract.salary,
          ledgerStatus,
        },
      });
    }

    return client.contractSeasonLedger.create({
      data: {
        contractId: contract.id,
        seasonId: contract.seasonId,
        annualSalary: contract.salary,
        yearsRemainingAtStart: contract.yearsRemaining,
        ledgerStatus,
      },
    });
  }

  return {
    async syncContractLedger(contractId: string) {
      const contract = await client.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          seasonId: true,
          teamId: true,
          playerId: true,
          salary: true,
          yearsRemaining: true,
          isFranchiseTag: true,
          status: true,
          endedAt: true,
        },
      });

      if (!contract) {
        throw new Error("CONTRACT_NOT_FOUND");
      }

      return upsertLedgerForContract(contract);
    },
    async ensureTeamSeasonLedgerCoverage(input: { teamId: string; seasonId: string }) {
      const contracts = await client.contract.findMany({
        where: {
          teamId: input.teamId,
          seasonId: input.seasonId,
        },
        select: {
          id: true,
          seasonId: true,
          teamId: true,
          playerId: true,
          salary: true,
          yearsRemaining: true,
          isFranchiseTag: true,
          status: true,
          endedAt: true,
        },
      });

      let syncedCount = 0;
      for (const contract of contracts) {
        await upsertLedgerForContract(contract);
        syncedCount += 1;
      }

      return {
        syncedCount,
      };
    },
  };
}
