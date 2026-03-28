import { TeamValidationContext } from "@/lib/compliance/context";

function buildBaseRuleset(): TeamValidationContext["ruleset"] {
  return {
    id: "ruleset-1",
    leagueId: "league-1",
    isActive: true,
    version: 1,
    effectiveAt: new Date("2026-01-01T00:00:00.000Z"),
    notes: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    rosterSize: 17,
    starterQb: 1,
    starterQbFlex: 1,
    starterRb: 2,
    starterWr: 3,
    starterTe: 1,
    starterFlex: 1,
    starterDst: 1,
    irSlots: 2,
    salaryCapSoft: 245,
    salaryCapHard: 300,
    waiverBidMaxAtOrAboveSoftCap: 0,
    minContractYears: 1,
    maxContractYears: 4,
    minSalary: 1,
    maxContractYearsIfSalaryBelowTen: 3,
    rookieBaseYears: 1,
    rookieOptionYears: 2,
    franchiseTagsPerTeam: 1,
    tradeDeadlineWeek: 11,
    regularSeasonWeeks: 13,
    playoffStartWeek: 14,
    playoffEndWeek: 16,
  };
}

export function buildBaseValidationContext(
  partial: Partial<TeamValidationContext> = {},
): TeamValidationContext {
  const base: TeamValidationContext = {
    league: {
      id: "league-1",
      name: "Dynasty Test League",
    },
    season: {
      id: "season-1",
      year: 2026,
      phase: "REGULAR_SEASON",
    },
    team: {
      id: "team-1",
      name: "Test Team",
      abbreviation: "TST",
    },
    ruleset: buildBaseRuleset(),
    rosterSlots: [],
    contracts: [],
    capPenalties: [],
  };

  return {
    ...base,
    ...partial,
    ruleset: {
      ...base.ruleset,
      ...(partial.ruleset ?? {}),
    },
    season: {
      ...base.season,
      ...(partial.season ?? {}),
    },
    team: {
      ...base.team,
      ...(partial.team ?? {}),
    },
    league: {
      ...base.league,
      ...(partial.league ?? {}),
    },
    rosterSlots: partial.rosterSlots ?? base.rosterSlots,
    contracts: partial.contracts ?? base.contracts,
    capPenalties: partial.capPenalties ?? base.capPenalties,
  };
}
