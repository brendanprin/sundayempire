import { ContractStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ContractDbClient = PrismaClient | Prisma.TransactionClient;

export const ACTIVE_CONTRACT_STATUSES = [
  ContractStatus.ACTIVE,
  ContractStatus.EXPIRING,
  ContractStatus.TAGGED,
] as const satisfies readonly ContractStatus[];

export function isActiveContractStatus(status: ContractStatus) {
  return (ACTIVE_CONTRACT_STATUSES as readonly ContractStatus[]).includes(status);
}

export function resolveContractStatus(input: {
  status?: ContractStatus | null;
  yearsRemaining: number;
  isFranchiseTag: boolean;
  endedAt?: Date | null;
}) {
  if (input.status === ContractStatus.TERMINATED || input.status === ContractStatus.EXPIRED) {
    return input.status;
  }

  if (input.endedAt) {
    return ContractStatus.TERMINATED;
  }

  if (input.yearsRemaining <= 0) {
    return ContractStatus.EXPIRED;
  }

  if (input.isFranchiseTag || input.status === ContractStatus.TAGGED) {
    return ContractStatus.TAGGED;
  }

  if (input.yearsRemaining === 1) {
    return ContractStatus.EXPIRING;
  }

  return ContractStatus.ACTIVE;
}

export function isPlayerRetired(injuryStatus: string | null | undefined) {
  if (!injuryStatus) {
    return false;
  }

  return /retir/i.test(injuryStatus);
}

export function createContractDbClient(client: ContractDbClient = prisma) {
  return client;
}
