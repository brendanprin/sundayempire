import { ContractStatus } from "@prisma/client";
import { DashboardProjectionDbClient, buildDashboardSeasonSummary, isOpenIssueStatus, summarizeIssueSeverities } from "@/lib/read-models/dashboard/shared";
import { TeamDashboardProjection } from "@/lib/read-models/dashboard/types";
import { prisma } from "@/lib/prisma";

const ACTIVE_DASHBOARD_CONTRACT_STATUSES: ContractStatus[] = ["ACTIVE", "EXPIRING", "TAGGED"];

export function createTeamDashboardProjection(client: DashboardProjectionDbClient = prisma) {
  return {
    async read(input: { teamId: string; seasonId: string; now?: Date }): Promise<TeamDashboardProjection | null> {
      const now = input.now ?? new Date();

      const [team, season] = await Promise.all([
        client.team.findUnique({
          where: { id: input.teamId },
          select: {
            id: true,
            leagueId: true,
            name: true,
            abbreviation: true,
            divisionLabel: true,
          },
        }),
        client.season.findUnique({
          where: { id: input.seasonId },
          select: {
            id: true,
            leagueId: true,
            year: true,
            status: true,
            phase: true,
            openedAt: true,
            closedAt: true,
          },
        }),
      ]);

      if (!team || !season || team.leagueId !== season.leagueId) {
        return null;
      }

      const [ruleset, teamSeasonState, openIssues, contracts] = await Promise.all([
        client.leagueRuleSet.findFirst({
          where: {
            leagueId: season.leagueId,
            isActive: true,
          },
          orderBy: {
            version: "desc",
          },
          select: {
            rosterSize: true,
            salaryCapSoft: true,
            salaryCapHard: true,
          },
        }),
        client.teamSeasonState.findUnique({
          where: {
            teamId_seasonId: {
              teamId: team.id,
              seasonId: season.id,
            },
          },
          select: {
            rosterCount: true,
            activeCapTotal: true,
            deadCapTotal: true,
            hardCapTotal: true,
            lastRecalculatedAt: true,
          },
        }),
        client.complianceIssue.findMany({
          where: {
            leagueId: season.leagueId,
            seasonId: season.id,
            teamId: team.id,
            status: {
              in: ["OPEN", "IN_REVIEW"],
            },
          },
          select: {
            severity: true,
            dueAt: true,
            status: true,
          },
        }),
        client.contract.findMany({
          where: {
            seasonId: season.id,
            teamId: team.id,
            status: {
              in: ACTIVE_DASHBOARD_CONTRACT_STATUSES,
            },
          },
          select: {
            id: true,
            status: true,
            rookieOptionEligible: true,
            rookieOptionExercised: true,
            optionDecisions: {
              where: {
                seasonId: season.id,
              },
              select: {
                id: true,
              },
              take: 1,
            },
          },
        }),
      ]);

      const issueSummary = summarizeIssueSeverities(
        openIssues.filter((issue) => isOpenIssueStatus(issue.status)).map((issue) => ({
          severity: issue.severity,
          dueAt: issue.dueAt,
        })),
        now,
      );

      const unresolvedRookieOptionCount = contracts.filter(
        (contract) =>
          contract.rookieOptionEligible &&
          !contract.rookieOptionExercised &&
          contract.optionDecisions.length === 0,
      ).length;

      return {
        team: {
          id: team.id,
          leagueId: team.leagueId,
          name: team.name,
          abbreviation: team.abbreviation,
          divisionLabel: team.divisionLabel,
        },
        season: buildDashboardSeasonSummary(season),
        rosterCapSummary: {
          stateAvailable: Boolean(teamSeasonState),
          mirrorOnly: season.phase === "REGULAR_SEASON",
          rosterCount: teamSeasonState?.rosterCount ?? null,
          rosterLimit: ruleset?.rosterSize ?? null,
          activeCapTotal: teamSeasonState?.activeCapTotal ?? null,
          deadCapTotal: teamSeasonState?.deadCapTotal ?? null,
          hardCapTotal: teamSeasonState?.hardCapTotal ?? null,
          softCapLimit: ruleset?.salaryCapSoft ?? null,
          hardCapLimit: ruleset?.salaryCapHard ?? null,
          capSpaceSoft:
            teamSeasonState && ruleset ? ruleset.salaryCapSoft - teamSeasonState.hardCapTotal : null,
          capSpaceHard:
            teamSeasonState && ruleset ? ruleset.salaryCapHard - teamSeasonState.hardCapTotal : null,
          lastRecalculatedAt: teamSeasonState?.lastRecalculatedAt?.toISOString() ?? null,
        },
        complianceSummary: {
          openIssueCount: issueSummary.openIssueCount,
          warningCount: issueSummary.warningCount,
          errorCount: issueSummary.errorCount,
          criticalCount: issueSummary.criticalCount,
          highestSeverity: issueSummary.highestSeverity,
        },
        contractSummary: {
          expiringContractsCount: contracts.filter((contract) => contract.status === "EXPIRING").length,
          unresolvedRookieOptionCount,
          franchiseTagCandidateCount: null,
        },
        availability: {
          rulesetAvailable: Boolean(ruleset),
          unresolvedRookieOptionCountAvailable: true,
          franchiseTagCandidateCountAvailable: false,
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
