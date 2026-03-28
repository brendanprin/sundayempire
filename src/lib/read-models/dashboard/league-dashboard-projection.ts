import { DashboardProjectionDbClient, buildDashboardSeasonSummary, deriveLeagueAlertStatus, resolveLeagueSeasonContext, summarizeIssueSeverities } from "@/lib/read-models/dashboard/shared";
import { LeagueDashboardProjection } from "@/lib/read-models/dashboard/types";
import { prisma } from "@/lib/prisma";

export function createLeagueDashboardProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: { leagueId: string; seasonId?: string; now?: Date }): Promise<LeagueDashboardProjection | null> {
      const now = input.now ?? new Date();
      const context = await resolveLeagueSeasonContext(client, input);

      if (!context) {
        return null;
      }

      const teamCount = await client.team.count({
        where: {
          leagueId: context.league.id,
        },
      });

      if (!context.season) {
        const status = deriveLeagueAlertStatus({
          seasonResolved: false,
          highestSeverity: null,
          overdueCount: 0,
          openIssueCount: 0,
        });

        return {
          league: {
            id: context.league.id,
            name: context.league.name,
            description: context.league.description,
          },
          seasonSelection: context.seasonSelection,
          season: null,
          summary: {
            teamCount,
            openIssueCount: 0,
            overdueIssueCount: 0,
            warningCount: 0,
            errorCount: 0,
            criticalCount: 0,
          },
          status: {
            alertLevel: status.alertLevel,
            mirrorOnly: false,
            reason: status.reason,
          },
          recentPhaseTransition: null,
          generatedAt: now.toISOString(),
        };
      }

      const [openIssues, recentTransition] = await Promise.all([
        client.complianceIssue.findMany({
          where: {
            leagueId: context.league.id,
            seasonId: context.season.id,
            status: {
              in: ["OPEN", "IN_REVIEW"],
            },
          },
          select: {
            severity: true,
            dueAt: true,
          },
        }),
        client.leaguePhaseTransition.findFirst({
          where: {
            leagueId: context.league.id,
            seasonId: context.season.id,
          },
          orderBy: [
            {
              occurredAt: "desc",
            },
            {
              createdAt: "desc",
            },
          ],
          select: {
            id: true,
            fromPhase: true,
            toPhase: true,
            occurredAt: true,
            reason: true,
          },
        }),
      ]);

      const issueSummary = summarizeIssueSeverities(openIssues, now);
      const status = deriveLeagueAlertStatus({
        seasonResolved: true,
        highestSeverity: issueSummary.highestSeverity,
        overdueCount: issueSummary.overdueCount,
        openIssueCount: issueSummary.openIssueCount,
      });

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
          description: context.league.description,
        },
        seasonSelection: context.seasonSelection,
        season: buildDashboardSeasonSummary(context.season),
        summary: {
          teamCount,
          openIssueCount: issueSummary.openIssueCount,
          overdueIssueCount: issueSummary.overdueCount,
          warningCount: issueSummary.warningCount,
          errorCount: issueSummary.errorCount,
          criticalCount: issueSummary.criticalCount,
        },
        status: {
          alertLevel: status.alertLevel,
          mirrorOnly: context.season.phase === "REGULAR_SEASON",
          reason: status.reason,
        },
        recentPhaseTransition: recentTransition
          ? {
              id: recentTransition.id,
              fromPhase: recentTransition.fromPhase,
              toPhase: recentTransition.toPhase,
              occurredAt: recentTransition.occurredAt.toISOString(),
              reason: recentTransition.reason,
            }
          : null,
        generatedAt: now.toISOString(),
      };
    },
  };
}
