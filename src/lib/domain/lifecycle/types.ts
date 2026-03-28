import { LeaguePhase, SeasonStatus, TransitionStatus } from "@prisma/client";

export type LifecycleDeadlineView = {
  id: string;
  phase: LeaguePhase;
  deadlineType: string;
  scheduledAt: string;
  sourceType: string;
  reminderOffsets: number[];
};

export type LifecycleBlocker = {
  code: string;
  severity: "warning" | "error";
  message: string;
  context?: Record<string, unknown>;
};

export type LifecycleTransitionView = {
  id: string;
  fromPhase: LeaguePhase;
  toPhase: LeaguePhase;
  initiatedByType: string;
  initiatedByUserId: string | null;
  reason: string | null;
  transitionStatus: TransitionStatus;
  occurredAt: string;
};

export type LifecycleReadModel = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    status: SeasonStatus;
    phase: LeaguePhase;
    openedAt: string | null;
    closedAt: string | null;
  };
  currentPhase: LeaguePhase;
  nextPhase: LeaguePhase | null;
  deadlines: LifecycleDeadlineView[];
  blockers: LifecycleBlocker[];
  recentTransitions: LifecycleTransitionView[];
};
