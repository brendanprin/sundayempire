import { LeaguePhase, SeasonStatus } from "@prisma/client";
import { LifecycleBlocker } from "@/lib/domain/lifecycle/types";

export function evaluateLifecycleBlockers(input: {
  seasonStatus: SeasonStatus;
  currentPhase: LeaguePhase;
  nextPhase: LeaguePhase | null;
  deadlinesInCurrentPhase: number;
}) {
  const blockers: LifecycleBlocker[] = [];

  if (input.seasonStatus !== "ACTIVE") {
    blockers.push({
      code: "SEASON_NOT_ACTIVE",
      severity: "error",
      message: "Lifecycle reads require exactly one active season.",
      context: {
        seasonStatus: input.seasonStatus,
      },
    });
  }

  if (input.nextPhase && input.deadlinesInCurrentPhase === 0) {
    blockers.push({
      code: "CURRENT_PHASE_DEADLINES_MISSING",
      severity: "warning",
      message: "No deadlines are configured for the current lifecycle phase.",
      context: {
        currentPhase: input.currentPhase,
        nextPhase: input.nextPhase,
      },
    });
  }

  return blockers;
}
