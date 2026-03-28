import { evaluateLifecycleBlockers } from "@/lib/domain/lifecycle/phase-guards";
import { getNextLeaguePhase, toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import {
  DashboardProjectionDbClient,
  buildDashboardSeasonSummary,
  resolveLeagueSeasonContext,
} from "@/lib/read-models/dashboard/shared";
import { createDeadlineSummaryProjection } from "@/lib/read-models/dashboard/deadline-summary-projection";
import { RulesDeadlinesProjection } from "@/lib/read-models/detail/types";
import { prisma } from "@/lib/prisma";

function mapRuleset(ruleset: {
  id: string;
  leagueId: string;
  isActive: boolean;
  version: number;
  effectiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
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
}) {
  return {
    ...ruleset,
    effectiveAt: ruleset.effectiveAt.toISOString(),
    createdAt: ruleset.createdAt.toISOString(),
    updatedAt: ruleset.updatedAt.toISOString(),
  };
}

export function createRulesDeadlinesProjection(client: DashboardProjectionDbClient = prisma) {
  const deadlineProjection = createDeadlineSummaryProjection(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId?: string;
      now?: Date;
      deadlineLimit?: number;
      historyLimit?: number;
      transitionLimit?: number;
    }): Promise<RulesDeadlinesProjection | null> {
      const now = input.now ?? new Date();
      const historyLimit = Math.max(1, input.historyLimit ?? 6);
      const transitionLimit = Math.max(1, input.transitionLimit ?? 5);
      const context = await resolveLeagueSeasonContext(client, input);

      if (!context) {
        return null;
      }

      const deadlineSummary = await deadlineProjection.read({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        limit: input.deadlineLimit,
        now,
      });

      const rulesets = await client.leagueRuleSet.findMany({
        where: {
          leagueId: context.league.id,
        },
        orderBy: [{ version: "desc" }],
        take: historyLimit,
        select: {
          id: true,
          leagueId: true,
          isActive: true,
          version: true,
          effectiveAt: true,
          createdAt: true,
          updatedAt: true,
          notes: true,
          rosterSize: true,
          starterQb: true,
          starterQbFlex: true,
          starterRb: true,
          starterWr: true,
          starterTe: true,
          starterFlex: true,
          starterDst: true,
          irSlots: true,
          salaryCapSoft: true,
          salaryCapHard: true,
          waiverBidMaxAtOrAboveSoftCap: true,
          minContractYears: true,
          maxContractYears: true,
          minSalary: true,
          maxContractYearsIfSalaryBelowTen: true,
          rookieBaseYears: true,
          rookieOptionYears: true,
          franchiseTagsPerTeam: true,
          tradeDeadlineWeek: true,
          regularSeasonWeeks: true,
          playoffStartWeek: true,
          playoffEndWeek: true,
        },
      });

      const activeRuleset = rulesets.find((ruleset) => ruleset.isActive) ?? rulesets[0] ?? null;
      const recentTransitions = context.season
        ? await client.leaguePhaseTransition.findMany({
            where: {
              leagueId: context.league.id,
              seasonId: context.season.id,
            },
            orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
            take: transitionLimit,
            select: {
              id: true,
              fromPhase: true,
              toPhase: true,
              transitionStatus: true,
              occurredAt: true,
              reason: true,
            },
          })
        : [];

      const nextPhase = context.season ? getNextLeaguePhase(context.season.phase) : null;
      const blockers = context.season
        ? evaluateLifecycleBlockers({
            seasonStatus: context.season.status,
            currentPhase: context.season.phase,
            nextPhase,
            deadlinesInCurrentPhase: deadlineSummary?.summary.currentPhaseCount ?? 0,
          })
        : [];

      return {
        league: {
          id: context.league.id,
          name: context.league.name,
          description: context.league.description,
        },
        seasonSelection: context.seasonSelection,
        season: context.season ? buildDashboardSeasonSummary(context.season) : null,
        ruleset: activeRuleset ? mapRuleset(activeRuleset) : null,
        history: rulesets.map((ruleset) => ({
          id: ruleset.id,
          version: ruleset.version,
          isActive: ruleset.isActive,
          effectiveAt: ruleset.effectiveAt.toISOString(),
          createdAt: ruleset.createdAt.toISOString(),
          notes: ruleset.notes,
        })),
        deadlines: {
          summary: deadlineSummary?.summary ?? {
            totalDeadlines: 0,
            currentPhaseCount: 0,
            overdueCount: 0,
          },
          currentPhaseDeadlines: deadlineSummary?.currentPhaseDeadlines ?? [],
          upcomingDeadlines: deadlineSummary?.upcomingDeadlines ?? [],
        },
        lifecycle: {
          currentPhase: context.season?.phase ?? null,
          legacyPhase: context.season ? toLegacyLeaguePhase(context.season.phase) : null,
          nextPhase,
          blockers,
          recentTransitions: recentTransitions.map((transition) => ({
            id: transition.id,
            fromPhase: transition.fromPhase,
            toPhase: transition.toPhase,
            transitionStatus: transition.transitionStatus,
            occurredAt: transition.occurredAt.toISOString(),
            reason: transition.reason,
          })),
        },
        availability: {
          rulesetAvailable: Boolean(activeRuleset),
          seasonResolved: Boolean(context.season),
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
