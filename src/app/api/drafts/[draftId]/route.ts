import { DraftStatus, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { toDraftSummary } from "@/lib/draft";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";
import {
  DRAFT_LIFECYCLE_ACTIONS,
  DraftBoardResponse,
  DraftLifecycleActionRequest,
  DraftLifecycleActionResponse,
  isDraftLifecycleAction,
} from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

async function loadDraftForActiveSeason(input: {
  draftId: string;
  leagueId: string;
  seasonId: string;
}) {
  const draftInLeague = await prisma.draft.findFirst({
    where: {
      id: input.draftId,
      leagueId: input.leagueId,
    },
    include: {
      _count: {
        select: {
          picks: true,
          draftPicks: true,
        },
      },
      draftPicks: {
        where: {
          status: {
            not: "PENDING",
          },
        },
        select: {
          id: true,
        },
      },
      picks: {
        where: {
          madeAt: {
            not: null,
          },
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (!draftInLeague) {
    return {
      status: "missing" as const,
      draft: null,
    };
  }

  if (draftInLeague.seasonId !== input.seasonId) {
    return {
      status: "inactive" as const,
      draft: draftInLeague,
    };
  }

  return {
    status: "active" as const,
    draft: draftInLeague,
  };
}

function lifecycleSummary(action: string, draftTitle: string) {
  if (action === "START_DRAFT") {
    return `Started draft session "${draftTitle}".`;
  }

  if (action === "COMPLETE_DRAFT") {
    return `Completed draft session "${draftTitle}".`;
  }

  if (action === "ADVANCE_PICK") {
    return `Advanced draft clock for "${draftTitle}".`;
  }

  if (action === "REWIND_PICK") {
    return `Rewound draft clock for "${draftTitle}".`;
  }

  return `Set draft pick index for "${draftTitle}".`;
}

function validateInProgressStatus(status: DraftStatus) {
  return status === "IN_PROGRESS";
}

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const loaded = await loadDraftForActiveSeason({
    draftId,
    leagueId: context.leagueId,
    seasonId: context.seasonId,
  });

  if (loaded.status === "missing" || !loaded.draft) {
    return apiError(404, "DRAFT_NOT_FOUND", "Draft was not found in the active league.", {
      draftId,
    });
  }

  if (loaded.status === "inactive") {
    return apiError(
      409,
      "DRAFT_NOT_ACTIVE_SEASON",
      "Draft exists but is not part of the active season context.",
      {
        draftId,
        activeSeasonId: context.seasonId,
        draftSeasonId: loaded.draft.seasonId,
      },
    );
  }

  const draft = loaded.draft;
  const usesDraftBoard = draft._count.draftPicks > 0;

  const boardRows: DraftBoardResponse["board"] = usesDraftBoard
    ? (
        await prisma.draftPick.findMany({
          where: {
            draftId: draft.id,
          },
          include: {
            futurePick: {
              select: {
                id: true,
                isUsed: true,
                seasonYear: true,
                round: true,
                overall: true,
              },
            },
            selectingTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            selection: {
              include: {
                player: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                  },
                },
              },
            },
          },
          orderBy: {
            pickNumber: "asc",
          },
        })
      ).map((pick) => ({
        id: pick.id,
        pickId: pick.futurePickId,
        futurePickStatus: pick.futurePick ? (pick.futurePick.isUsed ? "used" : "available") : null,
        futurePickSeasonYear: pick.futurePick?.seasonYear ?? null,
        futurePickRound: pick.futurePick?.round ?? null,
        futurePickOverall: pick.futurePick?.overall ?? null,
        selectingTeamId: pick.selectingTeam.id,
        selectingTeamName: pick.selectingTeam.name,
        selectingTeamAbbreviation: pick.selectingTeam.abbreviation,
        round: pick.round,
        pickNumber: pick.pickNumber,
        playerId: pick.selection?.playerId ?? null,
        playerName: pick.selection?.player?.name ?? null,
        playerPosition: pick.selection?.player?.position ?? null,
        salary: pick.selection?.salary ?? null,
        contractYears: pick.selection?.contractYears ?? null,
        madeAt: pick.selection?.madeAt?.toISOString() ?? null,
        isPassed:
          pick.selection?.outcome === "PASSED" || pick.selection?.outcome === "FORFEITED",
      }))
    : (
        await prisma.draftSelection.findMany({
          where: {
            draftId: draft.id,
          },
          include: {
            pick: {
              select: {
                id: true,
                isUsed: true,
                seasonYear: true,
                round: true,
                overall: true,
              },
            },
            selectingTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
                position: true,
              },
            },
          },
          orderBy: {
            pickNumber: "asc",
          },
        })
      ).map((selection) => ({
        id: selection.id,
        pickId: selection.pickId,
        futurePickStatus: selection.pick ? (selection.pick.isUsed ? "used" : "available") : null,
        futurePickSeasonYear: selection.pick?.seasonYear ?? null,
        futurePickRound: selection.pick?.round ?? null,
        futurePickOverall: selection.pick?.overall ?? null,
        selectingTeamId: selection.selectingTeam.id,
        selectingTeamName: selection.selectingTeam.name,
        selectingTeamAbbreviation: selection.selectingTeam.abbreviation,
        round: selection.round,
        pickNumber: selection.pickNumber,
        playerId: selection.playerId,
        playerName: selection.player?.name ?? null,
        playerPosition: selection.player?.position ?? null,
        salary: selection.salary,
        contractYears: selection.contractYears,
        madeAt: selection.madeAt?.toISOString() ?? null,
        isPassed: selection.isPassed,
      }));

  const draftSummary = toDraftSummary(
    {
      id: draft.id,
      leagueId: draft.leagueId,
      seasonId: draft.seasonId,
      type: draft.type,
      status: draft.status,
      title: draft.title,
      currentPickIndex: draft.currentPickIndex,
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    },
    {
      totalPicks: usesDraftBoard ? draft._count.draftPicks : draft._count.picks,
      picksMade: usesDraftBoard ? draft.draftPicks.length : draft.picks.length,
    },
  );

  const currentPick =
    draftSummary.progress.currentPickNumber !== null
      ? boardRows.find((row) => row.pickNumber === draftSummary.progress.currentPickNumber) ?? null
      : null;

  const response: DraftBoardResponse = {
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    draft: draftSummary,
    board: boardRows,
    currentPick,
  };

  return NextResponse.json(response);
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;

  const loaded = await loadDraftForActiveSeason({
    draftId,
    leagueId: context.leagueId,
    seasonId: context.seasonId,
  });

  if (loaded.status === "missing" || !loaded.draft) {
    return apiError(404, "DRAFT_NOT_FOUND", "Draft was not found in the active league.", {
      draftId,
    });
  }

  if (loaded.status === "inactive") {
    return apiError(
      409,
      "DRAFT_NOT_ACTIVE_SEASON",
      "Draft exists but is not part of the active season context.",
      {
        draftId,
        activeSeasonId: context.seasonId,
        draftSeasonId: loaded.draft.seasonId,
      },
    );
  }

  const draft = loaded.draft;
  const body = (await request.json().catch(() => ({}))) as DraftLifecycleActionRequest;
  const action = body.action;

  if (!isDraftLifecycleAction(action)) {
    return apiError(
      400,
      "INVALID_DRAFT_ACTION",
      "action must be a valid draft lifecycle operation.",
      {
        validActions: DRAFT_LIFECYCLE_ACTIONS,
      },
    );
  }

  const totalPicks = draft._count.draftPicks > 0 ? draft._count.draftPicks : draft._count.picks;
  const picksMade = draft._count.draftPicks > 0 ? draft.draftPicks.length : draft.picks.length;
  const maxPickIndex = Math.max(totalPicks - 1, 0);

  const before = {
    status: draft.status,
    currentPickIndex: draft.currentPickIndex,
    startedAt: draft.startedAt,
    completedAt: draft.completedAt,
  };

  let nextStatus = draft.status;
  let nextPickIndex = draft.currentPickIndex;
  let nextStartedAt = draft.startedAt;
  let nextCompletedAt = draft.completedAt;

  if (action === "START_DRAFT") {
    if (draft.type === "ROOKIE" && totalPicks === 0) {
      return apiError(
        409,
        "DRAFT_SETUP_REQUIRED",
        "Rookie draft order must be generated before the draft can start.",
        {
          draftId,
        },
      );
    }

    if (draft.type === "VETERAN_AUCTION") {
      const poolEntryCount = await prisma.auctionPlayerPoolEntry.count({
        where: {
          draftId: draft.id,
        },
      });

      if (draft.auctionPoolReviewStatus !== "FINALIZED") {
        return apiError(
          409,
          "AUCTION_POOL_FINALIZATION_REQUIRED",
          "Finalize the veteran auction pool before opening the auction.",
          {
            draftId,
          },
        );
      }

      if (poolEntryCount === 0) {
        return apiError(
          409,
          "AUCTION_POOL_EMPTY",
          "Generate at least one eligible veteran before opening the auction.",
          {
            draftId,
          },
        );
      }
    }

    if (draft.status !== "NOT_STARTED") {
      return apiError(
        409,
        "DRAFT_STATUS_TRANSITION_INVALID",
        "Draft can only be started from NOT_STARTED status.",
        {
          draftId,
          currentStatus: draft.status,
          targetStatus: "IN_PROGRESS",
        },
      );
    }

    nextStatus = "IN_PROGRESS";
    nextStartedAt = draft.startedAt ?? new Date();
    nextCompletedAt = null;
  }

  if (action === "COMPLETE_DRAFT") {
    if (draft.status !== "IN_PROGRESS") {
      return apiError(
        409,
        "DRAFT_STATUS_TRANSITION_INVALID",
        "Draft can only be completed from IN_PROGRESS status.",
        {
          draftId,
          currentStatus: draft.status,
          targetStatus: "COMPLETED",
        },
      );
    }

    nextStatus = "COMPLETED";
    nextCompletedAt = new Date();
    nextPickIndex = maxPickIndex;
  }

  if (action === "ADVANCE_PICK") {
    if (!validateInProgressStatus(draft.status)) {
      return apiError(
        409,
        "DRAFT_STATUS_INVALID",
        "Draft pick clock can only be changed while IN_PROGRESS.",
        {
          draftId,
          currentStatus: draft.status,
        },
      );
    }

    if (totalPicks === 0 || draft.currentPickIndex >= maxPickIndex) {
      return apiError(
        409,
        "DRAFT_PICK_INDEX_OUT_OF_BOUNDS",
        "Draft clock is already at the final pick.",
        {
          draftId,
          currentPickIndex: draft.currentPickIndex,
          maxPickIndex,
        },
      );
    }

    nextPickIndex = draft.currentPickIndex + 1;
  }

  if (action === "REWIND_PICK") {
    if (!validateInProgressStatus(draft.status)) {
      return apiError(
        409,
        "DRAFT_STATUS_INVALID",
        "Draft pick clock can only be changed while IN_PROGRESS.",
        {
          draftId,
          currentStatus: draft.status,
        },
      );
    }

    if (draft.currentPickIndex <= 0) {
      return apiError(
        409,
        "DRAFT_PICK_INDEX_OUT_OF_BOUNDS",
        "Draft clock is already at the first pick.",
        {
          draftId,
          currentPickIndex: draft.currentPickIndex,
          minPickIndex: 0,
        },
      );
    }

    nextPickIndex = draft.currentPickIndex - 1;
  }

  if (action === "SET_PICK_INDEX") {
    if (!validateInProgressStatus(draft.status)) {
      return apiError(
        409,
        "DRAFT_STATUS_INVALID",
        "Draft pick clock can only be changed while IN_PROGRESS.",
        {
          draftId,
          currentStatus: draft.status,
        },
      );
    }

    if (!Number.isInteger(body.nextPickIndex)) {
      return apiError(
        400,
        "INVALID_PICK_INDEX",
        "nextPickIndex must be an integer for SET_PICK_INDEX.",
      );
    }

    const requestedPickIndex = Number(body.nextPickIndex);
    if (requestedPickIndex < 0 || requestedPickIndex > maxPickIndex) {
      return apiError(
        409,
        "DRAFT_PICK_INDEX_OUT_OF_BOUNDS",
        "Requested pick index is outside the draft board bounds.",
        {
          draftId,
          requestedPickIndex,
          minPickIndex: 0,
          maxPickIndex,
        },
      );
    }

    nextPickIndex = requestedPickIndex;
  }

  const updatedDraft = await prisma.$transaction(async (tx) => {
    const updated = await tx.draft.update({
      where: {
        id: draft.id,
      },
      data: {
        status: nextStatus,
        currentPickIndex: nextPickIndex,
        startedAt: nextStartedAt,
        completedAt: nextCompletedAt,
      },
    });

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: lifecycleSummary(action, draft.title),
      metadata: {
        draftId: draft.id,
        action,
        totalPicks,
        picksMade,
        before: {
          status: before.status,
          currentPickIndex: before.currentPickIndex,
          startedAt: before.startedAt?.toISOString() ?? null,
          completedAt: before.completedAt?.toISOString() ?? null,
        },
        after: {
          status: updated.status,
          currentPickIndex: updated.currentPickIndex,
          startedAt: updated.startedAt?.toISOString() ?? null,
          completedAt: updated.completedAt?.toISOString() ?? null,
        },
        updatedBy: "api/drafts/[draftId] PATCH",
      },
    });

    return updated;
  });

  const response: DraftLifecycleActionResponse = {
    action,
    draft: toDraftSummary(
      {
        id: updatedDraft.id,
        leagueId: updatedDraft.leagueId,
        seasonId: updatedDraft.seasonId,
        type: updatedDraft.type,
        status: updatedDraft.status,
        title: updatedDraft.title,
        currentPickIndex: updatedDraft.currentPickIndex,
        startedAt: updatedDraft.startedAt,
        completedAt: updatedDraft.completedAt,
        createdAt: updatedDraft.createdAt,
        updatedAt: updatedDraft.updatedAt,
      },
      {
        totalPicks,
        picksMade,
      },
    ),
  };

  return NextResponse.json(response);
}
