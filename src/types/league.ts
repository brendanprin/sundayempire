export type LeaguePhaseValue =
  | "PRESEASON"
  | "REGULAR_SEASON"
  | "PLAYOFFS"
  | "OFFSEASON";

export type LeagueSummaryPayload = {
  league: {
    id: string;
    name: string;
    description: string | null;
  };
  season: {
    id: string;
    year: number;
    phase: LeaguePhaseValue;
    regularSeasonWeeks: number;
    playoffStartWeek: number;
    playoffEndWeek: number;
  };
  ruleset: {
    id: string;
    version: number;
    rosterSize: number;
    irSlots: number;
    salaryCapSoft: number;
    salaryCapHard: number;
    minSalary: number;
    minContractYears: number;
    maxContractYears: number;
    maxContractYearsIfSalaryBelowTen: number;
    franchiseTagsPerTeam: number;
    tradeDeadlineWeek: number;
  };
};
