import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const actorEmail = auth.actor?.email?.trim().toLowerCase() ?? "";
  if (!actorEmail) {
    return apiError(
      400,
      "ACTOR_EMAIL_REQUIRED",
      "Notification read state requires an authenticated actor email.",
    );
  }

  const now = new Date();
  if (auth.actor?.userId) {
    await prisma.notification.updateMany({
      where: {
        leagueId: context.leagueId,
        recipientUserId: auth.actor.userId,
        readAt: null,
      },
      data: {
        readAt: now,
      },
    });
  }
  await prisma.notificationReadState.upsert({
    where: {
      leagueId_actorEmail: {
        leagueId: context.leagueId,
        actorEmail,
      },
    },
    update: {
      lastReadAt: now,
    },
    create: {
      leagueId: context.leagueId,
      actorEmail,
      lastReadAt: now,
    },
  });

  return NextResponse.json({
    unreadCount: 0,
    readState: {
      lastReadAt: now.toISOString(),
    },
  });
}
