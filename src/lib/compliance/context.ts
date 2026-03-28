import { LeaguePhase, LeagueRuleSet, TeamSlotType } from "@prisma/client";
import { createDeadCapChargeService } from "@/lib/domain/contracts/dead-cap-charge-service";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

export type TeamValidationContext = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: LeaguePhase;
  };
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  ruleset: LeagueRuleSet;
  rosterSlots: {
    id: string;
    slotType: TeamSlotType;
    slotLabel: string | null;
    player: {
      id: string;
      name: string;
      position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
      injuryStatus: string | null;
    };
  }[];
  contracts: {
    id: string;
    salary: number;
    yearsTotal: number;
    yearsRemaining: number;
    isFranchiseTag: boolean;
    player: {
      id: string;
      name: string;
      position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
    };
  }[];
  capPenalties: {
    id: string;
    amount: number;
    reason: string;
  }[];
};

export type ValidationContextLookup = {
  leagueId: string;
  seasonId: string;
  teamId: string;
};

// This loader is intentionally repair-capable for mutation paths that need
// current ledger/dead-cap coverage before validating a write.
export async function loadTeamValidationContext(
  lookup: ValidationContextLookup,
): Promise<TeamValidationContext | null> {
  const [leagueSeason, ruleset, team] = await Promise.all([
    prisma.season.findFirst({
      where: {
        id: lookup.seasonId,
        leagueId: lookup.leagueId,
      },
      include: {
        league: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    }),
    prisma.leagueRuleSet.findFirst({
      where: {
        leagueId: lookup.leagueId,
        isActive: true,
      },
      orderBy: {
        version: "desc",
      },
    }),
    prisma.team.findFirst({
      where: {
        id: lookup.teamId,
        leagueId: lookup.leagueId,
      },
      select: {
        id: true,
        name: true,
        abbreviation: true,
      },
    }),
  ]);

  if (!leagueSeason || !ruleset || !team) {
    return null;
  }

  await createContractLedgerService(prisma).ensureTeamSeasonLedgerCoverage({
    teamId: lookup.teamId,
    seasonId: lookup.seasonId,
  });
  await createDeadCapChargeService(prisma).ensureLegacyDeadCapCoverage({
    leagueId: lookup.leagueId,
    teamId: lookup.teamId,
    seasonId: lookup.seasonId,
  });

  const [rosterSlots, contracts, deadCapCharges] = await Promise.all([
    prisma.rosterSlot.findMany({
      where: {
        seasonId: lookup.seasonId,
        teamId: lookup.teamId,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            injuryStatus: true,
          },
        },
      },
    }),
    prisma.contract.findMany({
      where: {
        seasonId: lookup.seasonId,
        teamId: lookup.teamId,
        status: {
          in: [...ACTIVE_CONTRACT_STATUSES],
        },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
    }),
    prisma.deadCapCharge.findMany({
      where: {
        teamId: lookup.teamId,
        appliesToSeasonId: lookup.seasonId,
      },
      select: {
        id: true,
        systemCalculatedAmount: true,
        adjustedAmount: true,
        sourceEventType: true,
        overrideReason: true,
      },
    }),
  ]);

  return {
    league: leagueSeason.league,
    season: {
      id: leagueSeason.id,
      year: leagueSeason.year,
      phase: leagueSeason.phase,
    },
    team,
    ruleset,
    rosterSlots,
    contracts,
    capPenalties: deadCapCharges.map((charge) => ({
      id: charge.id,
      amount: charge.adjustedAmount ?? charge.systemCalculatedAmount,
      reason:
        charge.overrideReason?.trim() ||
        (charge.sourceEventType === "CUT" ? "Dead cap from cut" : "Dead cap adjustment"),
    })),
  };
}
