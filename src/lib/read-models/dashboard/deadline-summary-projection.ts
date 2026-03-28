import { DashboardProjectionDbClient, calculateDeadlineUrgency, compareDeadlinesByUrgency, normalizeReminderOffsets, openIssueStatuses, resolveLeagueSeasonContext } from "@/lib/read-models/dashboard/shared";
import { DeadlineSummaryItem, DeadlineSummaryProjection } from "@/lib/read-models/dashboard/types";
import { toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { prisma } from "@/lib/prisma";

export function createDeadlineSummaryProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      limit?: number;
      now?: Date;
    }): Promise<DeadlineSummaryProjection | null> {
      const now = input.now ?? new Date();
      const limit = Math.max(1, input.limit ?? 3);
      const context = await resolveLeagueSeasonContext(client, input);

      if (!context) {
        return null;
      }

      if (!context.season) {
        return {
          league: {
            id: context.league.id,
            name: context.league.name,
          },
          seasonSelection: context.seasonSelection,
          season: null,
          summary: {
            totalDeadlines: 0,
            currentPhaseCount: 0,
            overdueCount: 0,
          },
          currentPhaseDeadlines: [],
          upcomingDeadlines: [],
          generatedAt: now.toISOString(),
        };
      }

      const [deadlines, openIssues] = await Promise.all([
        client.leagueDeadline.findMany({
          where: {
            leagueId: context.league.id,
            seasonId: context.season.id,
          },
          orderBy: [
            {
              scheduledAt: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
          select: {
            id: true,
            phase: true,
            deadlineType: true,
            scheduledAt: true,
            sourceType: true,
            reminderOffsetsJson: true,
          },
        }),
        client.complianceIssue.findMany({
          where: {
            leagueId: context.league.id,
            seasonId: context.season.id,
            status: {
              in: openIssueStatuses(),
            },
            leagueDeadlineId: {
              not: null,
            },
          },
          select: {
            leagueDeadlineId: true,
          },
        }),
      ]);

      const issueCountByDeadlineId = new Map<string, number>();
      for (const issue of openIssues) {
        if (!issue.leagueDeadlineId) {
          continue;
        }

        issueCountByDeadlineId.set(
          issue.leagueDeadlineId,
          (issueCountByDeadlineId.get(issue.leagueDeadlineId) ?? 0) + 1,
        );
      }

      const items: DeadlineSummaryItem[] = deadlines.map((deadline) => {
        const urgency = calculateDeadlineUrgency(deadline.scheduledAt, now);
        return {
          id: deadline.id,
          deadlineType: deadline.deadlineType,
          phase: deadline.phase,
          legacyPhase: toLegacyLeaguePhase(deadline.phase),
          scheduledAt: deadline.scheduledAt.toISOString(),
          sourceType: deadline.sourceType,
          reminderOffsets: normalizeReminderOffsets(deadline.reminderOffsetsJson),
          isCurrentPhase: deadline.phase === context.season!.phase,
          openIssueCount: issueCountByDeadlineId.get(deadline.id) ?? 0,
          overdue: urgency.overdue,
          urgency: urgency.urgency,
          daysUntilDue: urgency.daysUntilDue,
        };
      });

      const currentPhaseDeadlines = items.filter((deadline) => deadline.isCurrentPhase);
      const upcomingDeadlines = [...items].sort(compareDeadlinesByUrgency).slice(0, limit);

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
        },
        seasonSelection: context.seasonSelection,
        season: {
          id: context.season.id,
          year: context.season.year,
          currentPhase: context.season.phase,
          legacyPhase: toLegacyLeaguePhase(context.season.phase),
        },
        summary: {
          totalDeadlines: items.length,
          currentPhaseCount: currentPhaseDeadlines.length,
          overdueCount: items.filter((deadline) => deadline.overdue).length,
        },
        currentPhaseDeadlines,
        upcomingDeadlines,
        generatedAt: now.toISOString(),
      };
    },
  };
}
