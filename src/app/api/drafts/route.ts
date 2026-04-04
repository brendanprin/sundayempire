import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { toDraftSummary } from "@/lib/draft";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { logTransaction } from "@/lib/transactions";
import {
  CreateDraftRequest,
  CreateDraftResponse,
  DRAFT_STATUS_VALUES,
  DRAFT_TYPE_VALUES,
  DraftsListResponse,
  isDraftStatus,
  isDraftType,
} from "@/types/draft";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

  const params = request.nextUrl.searchParams;
  const rawStatus = params.get("status");
  const rawType = params.get("type");

  if (rawStatus !== null && !isDraftStatus(rawStatus)) {
    return apiError(
      400,
      "INVALID_FILTER_STATUS",
      "status must be one of NOT_STARTED, IN_PROGRESS, COMPLETED.",
      {
        validStatuses: DRAFT_STATUS_VALUES,
      },
    );
  }

  if (rawType !== null && !isDraftType(rawType)) {
    return apiError(
      400,
      "INVALID_FILTER_TYPE",
      "type must be one of STARTUP, ROOKIE, VETERAN_AUCTION.",
      {
        validTypes: DRAFT_TYPE_VALUES,
      },
    );
  }

  const drafts = await prisma.draft.findMany({
    where: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      ...(rawStatus ? { status: rawStatus } : {}),
      ...(rawType ? { type: rawType } : {}),
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
    orderBy: [{ createdAt: "desc" }],
  });

  const response: DraftsListResponse = {
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    filters: {
      status: rawStatus ?? null,
      type: rawType ?? null,
    },
    drafts: drafts.map((draft) =>
      toDraftSummary(
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
          totalPicks: draft._count.draftPicks > 0 ? draft._count.draftPicks : draft._count.picks,
          picksMade: draft._count.draftPicks > 0 ? draft.draftPicks.length : draft.picks.length,
        },
      ),
    ),
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;

  const json = await parseJsonBody<CreateDraftRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  if (!isDraftType(body.type)) {
    return apiError(
      400,
      "INVALID_DRAFT_TYPE",
      "type is required and must be one of ROOKIE or VETERAN_AUCTION.",
      {
        validTypes: ["ROOKIE", "VETERAN_AUCTION"],
      },
    );
  }

  if (body.type === "STARTUP") {
    return apiError(
      410,
      "DRAFT_TYPE_RETIRED",
      "Startup draft creation is retired. Use Picks & Draft for supported rookie and veteran draft workflows.",
      {
        retiredType: "STARTUP",
        supportedCreateTypes: ["ROOKIE", "VETERAN_AUCTION"],
        canonicalRoutes: ["/draft", "/draft/rookie", "/draft/veteran-auction"],
      },
    );
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return apiError(400, "INVALID_DRAFT_TITLE", "title is required.");
  }

  const existingActiveDraft = await prisma.draft.findFirst({
    where: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: body.type,
      status: {
        in: ["NOT_STARTED", "IN_PROGRESS"],
      },
    },
    select: {
      id: true,
      status: true,
      title: true,
    },
  });

  if (existingActiveDraft) {
    return apiError(
      409,
      "DRAFT_ALREADY_ACTIVE",
      "An active draft of this type already exists for the current season.",
      {
        draftId: existingActiveDraft.id,
        draftStatus: existingActiveDraft.status,
        draftTitle: existingActiveDraft.title,
      },
    );
  }

  const draft = await prisma.draft.create({
    data: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: body.type,
      title,
      status: "NOT_STARTED",
      currentPickIndex: 0,
    },
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    type: TransactionType.COMMISSIONER_OVERRIDE,
    summary: `Created ${draft.type} draft session "${draft.title}".`,
    metadata: {
      draftId: draft.id,
      draftType: draft.type,
      draftStatus: draft.status,
      draftTitle: draft.title,
      updatedBy: "api/drafts POST",
    },
  });

  const response: CreateDraftResponse = {
    draft: toDraftSummary(
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
        totalPicks: 0,
        picksMade: 0,
      },
    ),
  };

  return NextResponse.json(response, { status: 201 });
}
