export type RulesetEditableFields = {
  notes: string | null;
  rosterSize: number;
  starterQb: number;
  starterQbFlex: number;
  starterRb: number;
  starterWr: number;
  starterTe: number;
  starterFlex: number;
  starterDst: number;
  irSlots: number;
  salaryCapSoft: number;
  salaryCapHard: number;
  waiverBidMaxAtOrAboveSoftCap: number;
  minContractYears: number;
  maxContractYears: number;
  minSalary: number;
  maxContractYearsIfSalaryBelowTen: number;
  rookieBaseYears: number;
  rookieOptionYears: number;
  franchiseTagsPerTeam: number;
  tradeDeadlineWeek: number;
  regularSeasonWeeks: number;
  playoffStartWeek: number;
  playoffEndWeek: number;
};

export type RulesetSummary = RulesetEditableFields & {
  id: string;
  leagueId: string;
  isActive: boolean;
  version: number;
  effectiveAt: string;
  createdAt: string;
  updatedAt: string;
};

export type RulesetHistoryItem = Pick<
  RulesetSummary,
  "id" | "version" | "isActive" | "effectiveAt" | "createdAt" | "notes"
>;

export type RulesApiPayload = {
  ruleset: RulesetSummary;
  history: RulesetHistoryItem[];
};
