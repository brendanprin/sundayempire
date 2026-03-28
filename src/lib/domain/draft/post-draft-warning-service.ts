import { LeagueRole } from "@prisma/client";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { DraftDbClient } from "@/lib/domain/draft/shared";
import { prisma } from "@/lib/prisma";

const POST_DRAFT_CUTDOWN_CODE = "POST_DRAFT_CUTDOWN_WARNING";

export function createPostDraftWarningService(client: DraftDbClient = prisma) {
  return {
    async createCutdownWarnings(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      draftLabel?: string | null;
      actorUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
      now?: Date;
    }) {
      const now = input.now ?? new Date();
      const [ruleset, teamStates, teams] = await Promise.all([
        client.leagueRuleSet.findFirst({
          where: {
            leagueId: input.leagueId,
            isActive: true,
          },
          orderBy: {
            version: "desc",
          },
          select: {
            rosterSize: true,
          },
        }),
        client.teamSeasonState.findMany({
          where: {
            seasonId: input.seasonId,
          },
          select: {
            teamId: true,
            rosterCount: true,
          },
        }),
        client.team.findMany({
          where: {
            leagueId: input.leagueId,
          },
          select: {
            id: true,
            name: true,
          },
        }),
      ]);

      if (!ruleset) {
        return { created: 0 };
      }

      const issueService = createComplianceIssueService(prisma);
      const teamNameById = new Map(teams.map((team) => [team.id, team.name]));
      let created = 0;

      for (const state of teamStates) {
        if (state.rosterCount <= ruleset.rosterSize) {
          continue;
        }

        const existing = await client.complianceIssue.findFirst({
          where: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: state.teamId,
            code: POST_DRAFT_CUTDOWN_CODE,
            status: {
              in: ["OPEN", "IN_REVIEW"],
            },
          },
          select: {
            id: true,
          },
        });

        if (existing) {
          continue;
        }

        const overage = state.rosterCount - ruleset.rosterSize;
        const draftLabel = input.draftLabel?.trim() || "rookie draft";
        await issueService.createManualIssue({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: state.teamId,
          issueType: "ROSTER",
          severity: "WARNING",
          code: POST_DRAFT_CUTDOWN_CODE,
          title: `${teamNameById.get(state.teamId) ?? "Team"} needs a post-draft cutdown`,
          message: `Roster count is ${state.rosterCount} after the ${draftLabel}, which is ${overage} over the roster limit of ${ruleset.rosterSize}.`,
          explicitDueAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
          createdByUserId: input.actorUserId ?? null,
          actorRoleSnapshot: input.actorRoleSnapshot ?? null,
          metadata: {
            draftId: input.draftId,
            rosterCount: state.rosterCount,
            rosterLimit: ruleset.rosterSize,
            overage,
          },
        });
        created += 1;
      }

      return { created };
    },
  };
}
