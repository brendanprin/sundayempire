export function rookieSalaryForDraftSlot(input: { round: number; pickNumber: number }) {
  if (input.round === 1 && input.pickNumber <= 3) {
    return 5;
  }

  if (input.round === 1) {
    return 3;
  }

  return 1;
}

export function createRookieSalaryService() {
  return {
    salaryForSlot: rookieSalaryForDraftSlot,
  };
}

