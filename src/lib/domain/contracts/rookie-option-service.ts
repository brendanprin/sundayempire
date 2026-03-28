import { ContractStatus } from "@prisma/client";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { ContractDbClient, resolveContractStatus } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

export function createRookieOptionService(client: ContractDbClient = prisma) {
  const ledgerService = createContractLedgerService(client);

  return {
    async previewOptionExercise(input: {
      contractId: string;
      yearsToAdd: number;
      maxContractYears: number;
    }) {
      const contract = await client.contract.findUnique({
        where: { id: input.contractId },
        include: {
          player: {
            select: {
              id: true,
              name: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      if (!contract) {
        throw new Error("CONTRACT_NOT_FOUND");
      }

      if (
        !contract.rookieOptionEligible ||
        contract.rookieOptionExercised ||
        contract.status === ContractStatus.TERMINATED ||
        contract.status === ContractStatus.EXPIRED
      ) {
        throw new Error("ROOKIE_OPTION_NOT_AVAILABLE");
      }

      const nextYearsTotal = contract.yearsTotal + input.yearsToAdd;
      if (nextYearsTotal > input.maxContractYears) {
        throw new Error("CONTRACT_CONSTRAINT_VIOLATION");
      }

      return {
        contract,
        nextYearsTotal,
        nextYearsRemaining: contract.yearsRemaining + input.yearsToAdd,
      };
    },
    async exerciseOption(input: {
      contractId: string;
      yearsToAdd: number;
      maxContractYears: number;
      decidedByUserId?: string | null;
    }) {
      const preview = await this.previewOptionExercise(input);

      const updatedContract = await client.contract.update({
        where: { id: preview.contract.id },
        data: {
          yearsTotal: preview.nextYearsTotal,
          yearsRemaining: preview.nextYearsRemaining,
          endYear: preview.contract.endYear + input.yearsToAdd,
          rookieOptionExercised: true,
          rookieOptionEligible: false,
          status: resolveContractStatus({
            yearsRemaining: preview.nextYearsRemaining,
            isFranchiseTag: preview.contract.isFranchiseTag,
            endedAt: null,
          }),
        },
      });

      await client.contractOptionDecision.upsert({
        where: {
          seasonId_contractId: {
            seasonId: preview.contract.seasonId,
            contractId: preview.contract.id,
          },
        },
        update: {
          decisionType: "EXERCISE",
          decidedByUserId: input.decidedByUserId ?? null,
          decidedAt: new Date(),
          effectiveContractYearsAdded: input.yearsToAdd,
        },
        create: {
          seasonId: preview.contract.seasonId,
          teamId: preview.contract.teamId,
          playerId: preview.contract.playerId,
          contractId: preview.contract.id,
          decisionType: "EXERCISE",
          decidedByUserId: input.decidedByUserId ?? null,
          decidedAt: new Date(),
          effectiveContractYearsAdded: input.yearsToAdd,
        },
      });

      await ledgerService.syncContractLedger(updatedContract.id);

      return updatedContract;
    },
  };
}
