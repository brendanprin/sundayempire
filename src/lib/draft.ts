import { DraftStatus, DraftType } from "@prisma/client";
import { DraftSessionSummary } from "@/types/draft";

type DraftSummaryInput = {
  id: string;
  leagueId: string;
  seasonId: string;
  type: DraftType;
  status: DraftStatus;
  title: string;
  currentPickIndex: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type DraftProgressInput = {
  totalPicks: number;
  picksMade: number;
};

export function toDraftSummary(
  draft: DraftSummaryInput,
  progress: DraftProgressInput,
): DraftSessionSummary {
  const picksRemaining = Math.max(progress.totalPicks - progress.picksMade, 0);
  const currentPickNumber =
    draft.status === "COMPLETED" || progress.totalPicks === 0
      ? null
      : Math.min(draft.currentPickIndex + 1, progress.totalPicks);

  return {
    id: draft.id,
    leagueId: draft.leagueId,
    seasonId: draft.seasonId,
    type: draft.type,
    status: draft.status,
    title: draft.title,
    currentPickIndex: draft.currentPickIndex,
    startedAt: draft.startedAt?.toISOString() ?? null,
    completedAt: draft.completedAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
    progress: {
      totalPicks: progress.totalPicks,
      picksMade: progress.picksMade,
      picksRemaining,
      currentPickNumber,
    },
  };
}
