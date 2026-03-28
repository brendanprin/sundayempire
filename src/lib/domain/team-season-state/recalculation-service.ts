import { Prisma, PrismaClient } from "@prisma/client";
import { createTeamFinancialStateService } from "@/lib/domain/contracts/team-financial-state-service";
import { createTeamSeasonStateRepository } from "@/lib/domain/team-season-state/repository";
import { prisma } from "@/lib/prisma";

type TeamSeasonStateDbClient = PrismaClient | Prisma.TransactionClient;

export function createTeamSeasonStateRecalculationService(
  client: TeamSeasonStateDbClient = prisma,
  dependencies?: {
    financialStateService?: Pick<
      ReturnType<typeof createTeamFinancialStateService>,
      "computeTeamSeasonFinancials"
    >;
  },
) {
  const repository = createTeamSeasonStateRepository(client);
  const financialStateService =
    dependencies?.financialStateService ?? createTeamFinancialStateService(client);

  return {
    async recalculateTeamSeasonState(input: { teamId: string; seasonId: string }) {
      const [rosterCount, financials] = await Promise.all([
        client.rosterAssignment.count({
          where: {
            teamId: input.teamId,
            seasonId: input.seasonId,
            endedAt: null,
            rosterStatus: {
              in: ["ACTIVE", "IR", "MIRRORED_ONLY"],
            },
          },
        }),
        financialStateService.computeTeamSeasonFinancials({
          teamId: input.teamId,
          seasonId: input.seasonId,
        }),
      ]);

      const lastRecalculatedAt = new Date();

      return repository.upsertState({
        teamId: input.teamId,
        seasonId: input.seasonId,
        rosterCount,
        activeCapTotal: financials.activeCapTotal,
        deadCapTotal: financials.deadCapTotal,
        hardCapTotal: financials.hardCapTotal,
        complianceStatus: null,
        lastRecalculatedAt,
      });
    },
  };
}
