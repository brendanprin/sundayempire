import { Prisma, PrismaClient } from "@prisma/client";
import { NotificationSummaryProjection } from "@/lib/read-models/dashboard/types";
import { prisma } from "@/lib/prisma";

type NotificationReadDbClient = PrismaClient | Prisma.TransactionClient;

function categorizeNotification(eventType: string): NotificationSummaryProjection["items"][number]["category"] {
  if (eventType.startsWith("compliance.")) {
    return "compliance";
  }

  if (eventType.startsWith("commissioner.")) {
    return "commissioner";
  }

  if (eventType.startsWith("trade.")) {
    return "trade";
  }

  return "league";
}

export function createNotificationSummaryReadModel(client: NotificationReadDbClient = prisma) {
  return {
    async read(input: {
      leagueId: string;
      recipientUserId: string;
      limit?: number;
      sinceDate?: Date;
      now?: Date;
    }): Promise<NotificationSummaryProjection> {
      const now = input.now ?? new Date();
      const limit = Math.max(1, input.limit ?? 5);

      const [items, unreadCount] = await Promise.all([
        client.notification.findMany({
          where: {
            leagueId: input.leagueId,
            recipientUserId: input.recipientUserId,
            ...(input.sinceDate
              ? {
                  createdAt: {
                    gte: input.sinceDate,
                  },
                }
              : {}),
          },
          orderBy: {
            createdAt: "desc",
          },
          take: limit,
        }),
        client.notification.count({
          where: {
            leagueId: input.leagueId,
            recipientUserId: input.recipientUserId,
            readAt: null,
          },
        }),
      ]);

      return {
        unreadCount,
        items: items.map((notification) => ({
          id: notification.id,
          eventType: notification.eventType,
          category: categorizeNotification(notification.eventType),
          title: notification.title,
          body: notification.body,
          createdAt: notification.createdAt.toISOString(),
          readAt: notification.readAt?.toISOString() ?? null,
        })),
        generatedAt: now.toISOString(),
      };
    },
  };
}
