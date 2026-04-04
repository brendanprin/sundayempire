import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const actorEmail = actor?.email?.trim().toLowerCase() ?? "";
  if (!actorEmail) {
    return apiError(
      400,
      "ACTOR_EMAIL_REQUIRED",
      "Notification read state requires an authenticated actor email.",
    );
  }

  const now = new Date();
  if (actor?.userId) {
    await prisma.notification.updateMany({
      where: {
        leagueId: context.leagueId,
        recipientUserId: actor.userId,
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
