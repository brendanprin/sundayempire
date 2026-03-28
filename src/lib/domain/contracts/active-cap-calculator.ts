import { ContractStatus } from "@prisma/client";
import { isActiveContractStatus } from "@/lib/domain/contracts/shared";

export type ActiveCapLedgerEntry = {
  annualSalary: number;
  ledgerStatus: ContractStatus;
};

export function computeActiveCapTotal(entries: ActiveCapLedgerEntry[]) {
  return entries.reduce((total, entry) => {
    if (!isActiveContractStatus(entry.ledgerStatus)) {
      return total;
    }

    return total + entry.annualSalary;
  }, 0);
}
