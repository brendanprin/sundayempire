import { Prisma, PrismaClient } from "@prisma/client";
import { TeamValidationContext, ValidationContextLookup } from "@/lib/compliance/context";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

export type ComplianceReadDbClient = PrismaClient | Prisma.TransactionClient;

export function createReadOnlyValidationContextLoader(
  client: ComplianceReadDbClient = prisma,
) {
  return {
    // Pure read loader for projections, previews, and compliance scans.
    async loadTeamValidationContext(
      lookup: ValidationContextLookup,
    ): Promise<TeamValidationContext | null> {
      const [leagueSeason, ruleset, team] = await Promise.all([
        client.season.findFirst({
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
        client.leagueRuleSet.findFirst({
          where: {
            leagueId: lookup.leagueId,
            isActive: true,
          },
          orderBy: {
            version: "desc",
          },
        }),
        client.team.findFirst({
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

      const [rosterSlots, contracts, deadCapCharges] = await Promise.all([
        client.rosterSlot.findMany({
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
        client.contract.findMany({
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
        client.deadCapCharge.findMany({
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
            (charge.sourceEventType === "CUT"
              ? "Dead cap from cut"
              : "Dead cap adjustment"),
        })),
      };
    },
  };
}
