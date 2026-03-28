export type DeadCapChargeInput = {
  annualSalary: number;
  yearsRemaining: number;
  afterTradeDeadline: boolean;
  retired: boolean;
};

export type DeadCapChargeScheduleEntry = {
  seasonOffset: 0 | 1 | 2;
  amount: number;
};

export type DeadCapLedgerEntry = {
  systemCalculatedAmount: number;
  adjustedAmount: number | null;
};

function carryoverPercent(futureYearsAfterCurrent: number) {
  if (futureYearsAfterCurrent >= 3) {
    return 0.75;
  }

  if (futureYearsAfterCurrent === 2) {
    return 0.5;
  }

  if (futureYearsAfterCurrent === 1) {
    return 0.25;
  }

  return 0;
}

export function computeDeadCapSchedule(input: DeadCapChargeInput): DeadCapChargeScheduleEntry[] {
  if (input.retired || input.yearsRemaining <= 0) {
    return [];
  }

  const currentCharge = Math.ceil(input.annualSalary);
  const futureYearsAfterCurrent = Math.max(0, input.yearsRemaining - 1);
  const futureCharge = Math.ceil(input.annualSalary * carryoverPercent(futureYearsAfterCurrent));

  if (input.afterTradeDeadline) {
    const schedule: DeadCapChargeScheduleEntry[] = [
      {
        seasonOffset: 1,
        amount: currentCharge,
      },
    ];

    if (futureCharge > 0) {
      schedule.push({
        seasonOffset: 2,
        amount: futureCharge,
      });
    }

    return schedule;
  }

  const schedule: DeadCapChargeScheduleEntry[] = [
    {
      seasonOffset: 0,
      amount: currentCharge,
    },
  ];

  if (futureCharge > 0) {
    schedule.push({
      seasonOffset: 1,
      amount: futureCharge,
    });
  }

  return schedule;
}

export function computeDeadCapTotal(entries: DeadCapLedgerEntry[]) {
  return entries.reduce(
    (total, entry) => total + (entry.adjustedAmount ?? entry.systemCalculatedAmount),
    0,
  );
}
