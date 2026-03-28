import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requirePickLeagueRole } from "@/lib/authorization";
import { createPickOwnershipService } from "@/lib/domain/draft/pick-ownership-service";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

type RouteContext = {
  params: Promise<{
    pickId: string;
  }>;
};

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { pickId } = await routeContext.params;
  const access = await requirePickLeagueRole(request, pickId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;

  const body = (await request.json()) as {
    newTeamId?: string;
  };

  if (!body.newTeamId) {
    return apiError(400, "INVALID_REQUEST", "newTeamId is required.");
  }

  const pick = await prisma.futurePick.findFirst({
    where: {
      id: pickId,
      leagueId: context.leagueId,
    },
    include: {
      currentTeam: {
        select: {
          id: true,
          name: true,
        },
      },
      originalTeam: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!pick) {
    return apiError(404, "PICK_NOT_FOUND", "Pick was not found in the active league.");
  }

  const newTeam = await prisma.team.findFirst({
    where: {
      id: body.newTeamId,
      leagueId: context.leagueId,
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  });

  if (!newTeam) {
    return apiError(404, "TEAM_NOT_FOUND", "Destination team was not found.");
  }

  const oldTeamId = pick.currentTeamId;
  if (oldTeamId === newTeam.id) {
    return apiError(
      400,
      "NO_TRANSFER_NEEDED",
      "Pick already belongs to the specified destination team.",
    );
  }

  const transfer = await createPickOwnershipService(prisma).transferOwnership({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    pickId: pick.id,
    newTeamId: newTeam.id,
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: newTeam.id,
    type: TransactionType.PICK_TRANSFER,
    summary: `Transferred ${transfer.pick.seasonYear} R${transfer.pick.round} pick to ${newTeam.name}.`,
    metadata: {
      pickId: transfer.pick.id,
      seasonYear: transfer.pick.seasonYear,
      round: transfer.pick.round,
      fromTeamId: oldTeamId,
      toTeamId: newTeam.id,
      orderEntryUpdates: transfer.orderEntryUpdates,
      draftPickUpdates: transfer.draftPickUpdates,
      updatedBy: "api/picks/[pickId]/owner PATCH",
    },
  });

  return NextResponse.json({ pick: transfer.pick });
}
