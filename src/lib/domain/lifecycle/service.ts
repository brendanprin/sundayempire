import { errorResult, okResult } from "@/lib/application/result";
import { evaluateLifecycleBlockers } from "@/lib/domain/lifecycle/phase-guards";
import { getNextLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { createLifecycleRepository, LifecycleRepository } from "@/lib/domain/lifecycle/repository";
import { getStrictActiveSeason } from "@/lib/domain/lifecycle/season-selection";
import { LifecycleReadModel } from "@/lib/domain/lifecycle/types";

export function createLifecycleService(repository: LifecycleRepository = createLifecycleRepository()) {
  return {
    async readLeagueLifecycle(leagueId: string) {
      const league = await repository.getLeagueLifecycleRecord(leagueId);
      if (!league) {
        return errorResult("LEAGUE_NOT_FOUND", "League was not found.", 404);
      }

      const activeSeason = getStrictActiveSeason(league.seasons);
      if (!activeSeason) {
        return errorResult(
          "ACTIVE_SEASON_NOT_RESOLVED",
          "Exactly one ACTIVE season is required to read lifecycle state.",
          409,
          {
            leagueId,
            seasonCount: league.seasons.length,
            activeSeasonCount: league.seasons.filter((season) => season.status === "ACTIVE").length,
          },
        );
      }

      const [deadlines, recentTransitions] = await Promise.all([
        repository.getSeasonDeadlines(league.id, activeSeason.id),
        repository.getRecentPhaseTransitions(league.id, activeSeason.id),
      ]);

      const nextPhase = getNextLeaguePhase(activeSeason.phase);
      const deadlinesForCurrentPhase = deadlines.filter((deadline) => deadline.phase === activeSeason.phase);
      const blockers = evaluateLifecycleBlockers({
        seasonStatus: activeSeason.status,
        currentPhase: activeSeason.phase,
        nextPhase,
        deadlinesInCurrentPhase: deadlinesForCurrentPhase.length,
      });

      const payload: LifecycleReadModel = {
        league: {
          id: league.id,
          name: league.name,
        },
        season: {
          id: activeSeason.id,
          year: activeSeason.year,
          status: activeSeason.status,
          phase: activeSeason.phase,
          openedAt: activeSeason.openedAt?.toISOString() ?? null,
          closedAt: activeSeason.closedAt?.toISOString() ?? null,
        },
        currentPhase: activeSeason.phase,
        nextPhase,
        deadlines: deadlinesForCurrentPhase.map((deadline) => ({
          id: deadline.id,
          phase: deadline.phase,
          deadlineType: deadline.deadlineType,
          scheduledAt: deadline.scheduledAt.toISOString(),
          sourceType: deadline.sourceType,
          reminderOffsets: Array.isArray(deadline.reminderOffsetsJson)
            ? deadline.reminderOffsetsJson.map((value) => Number(value)).filter((value) => Number.isFinite(value))
            : [],
        })),
        blockers,
        recentTransitions: recentTransitions.map((transition) => ({
          id: transition.id,
          fromPhase: transition.fromPhase,
          toPhase: transition.toPhase,
          initiatedByType: transition.initiatedByType,
          initiatedByUserId: transition.initiatedByUserId,
          reason: transition.reason,
          transitionStatus: transition.transitionStatus,
          occurredAt: transition.occurredAt.toISOString(),
        })),
      };

      return okResult(payload);
    },
  };
}
