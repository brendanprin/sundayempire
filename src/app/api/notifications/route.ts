import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createNotificationSummaryReadModel } from "@/lib/read-models/notifications/notification-summary";
import { parseIntegerParam } from "@/lib/request";

type NotificationBatch = {
  id: string;
  eventType: string;
  eventCategory: string;
  status: string | null;
  title: string;
  description: string;
  count: number;
  latestAt: string;
  unread: boolean;
};
type SignalMode = "all" | "high";

const HIGH_SIGNAL_EVENT_TYPES = new Set<string>([
  "compliance.issue.created",
  "compliance.issue.resolved",
  "compliance.deadline.approaching",
  "compliance.deadline.missed",
  "commissioner.override.recorded",
  "trade.proposal.created",
  "trade.proposal.submitted",
  "trade.proposal.review_pending",
  "trade.proposal.accepted",
  "trade.proposal.declined",
  "trade.proposal.review_approved",
  "trade.proposal.review_rejected",
  "trade.accepted",
  "commissioner.compliance.scan",
  "commissioner.phase.transition",
  "commissioner.rollover.apply",
  "commissioner.fix.apply",
  "commissioner.snapshot.apply",
]);

function toTitleCaseSegment(value: string) {
  if (value.length === 0) {
    return value;
  }

  return `${value.charAt(0).toUpperCase()}${value.slice(1).toLowerCase()}`;
}

function humanizeEventType(eventType: string) {
  const directLabels: Record<string, string> = {
    "trade.proposal.created": "Trade proposal created",
    "trade.proposal.submitted": "Trade proposal submitted",
    "trade.proposal.review_pending": "Trade proposal awaiting commissioner review",
    "trade.proposal.accepted": "Trade proposal accepted",
    "trade.proposal.declined": "Trade proposal declined",
    "trade.proposal.review_approved": "Trade proposal approved after review",
    "trade.proposal.review_rejected": "Trade proposal rejected after review",
    "trade.accepted": "Trade accepted",
    "trade.rejected": "Trade rejected",
    "trade.processed": "Trade processed",
    "roster.swap.completed": "Roster swap completed",
    "roster.move.completed": "Roster move completed",
    "roster.add.completed": "Roster add completed",
    "roster.drop.completed": "Roster drop completed",
    "roster.cut.completed": "Roster cut completed",
    "commissioner.phase.transition": "Season phase transition",
    "commissioner.compliance.scan": "League compliance scan",
    "commissioner.rollover.preview": "Rollover preview run",
    "commissioner.rollover.apply": "Rollover applied",
    "commissioner.fix.preview": "Emergency fix dry run",
    "commissioner.fix.apply": "Emergency fix applied",
    "commissioner.snapshot.preview": "Snapshot restore preview",
    "commissioner.snapshot.apply": "Snapshot restore applied",
    "feedback.submitted": "Pilot feedback submitted",
  };

  if (eventType in directLabels) {
    return directLabels[eventType];
  }

  return eventType
    .split(".")
    .map((segment) => toTitleCaseSegment(segment))
    .join(" ");
}

function buildBatchDescription(input: {
  eventCategory: string;
  status: string | null;
  count: number;
}) {
  const categoryLabel =
    input.eventCategory === "trade"
      ? "Trade workflow"
      : input.eventCategory === "roster"
        ? "Roster workflow"
        : input.eventCategory === "commissioner"
          ? "Commissioner operations"
          : input.eventCategory === "feedback"
            ? "Pilot feedback"
            : "League activity";

  if (input.count > 1) {
    return `${categoryLabel}: ${input.count} similar events were batched.`;
  }

  return input.status ? `${categoryLabel}: latest status ${input.status}.` : `${categoryLabel}: new event recorded.`;
}

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER", "MEMBER"]);
  if (auth.response) {
    return auth.response;
  }

  const params = request.nextUrl.searchParams;
  const rawLimit = parseIntegerParam(params.get("limit"));
  const rawSinceHours = parseIntegerParam(params.get("sinceHours"));
  const signalModeParam = (params.get("signalMode") ?? "all").toLowerCase();
  if (signalModeParam !== "all" && signalModeParam !== "high") {
    return apiError(400, "INVALID_REQUEST", "signalMode must be 'all' or 'high'.");
  }
  const signalMode = signalModeParam as SignalMode;
  if (rawLimit !== undefined && rawLimit <= 0) {
    return apiError(400, "INVALID_REQUEST", "limit must be a positive integer.");
  }
  if (rawSinceHours !== undefined && rawSinceHours <= 0) {
    return apiError(400, "INVALID_REQUEST", "sinceHours must be a positive integer.");
  }

  const limit = rawLimit ? Math.min(rawLimit, 80) : 25;
  const sinceHours = rawSinceHours ? Math.min(rawSinceHours, 24 * 30) : 24 * 7;
  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const actorEmail = auth.actor?.email?.toLowerCase() ?? null;
  const actorUserId = auth.actor?.userId ?? null;
  const readState =
    actorEmail === null
      ? null
      : await prisma.notificationReadState.findUnique({
          where: {
            leagueId_actorEmail: {
              leagueId: context.leagueId,
              actorEmail,
            },
          },
          select: {
            lastReadAt: true,
          },
        });

  const storedNotificationSummary =
    actorUserId === null
      ? null
      : await createNotificationSummaryReadModel(prisma).read({
          leagueId: context.leagueId,
          recipientUserId: actorUserId,
          limit,
          sinceDate,
        });

  const events = await prisma.pilotEvent.findMany({
    where: {
      leagueId: context.leagueId,
      createdAt: { gte: sinceDate },
      eventCategory: { not: "ui" },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(limit * 8, 120), 1000),
    select: {
      id: true,
      eventType: true,
      eventCategory: true,
      status: true,
      createdAt: true,
    },
  });

  const grouped = new Map<
    string,
    {
      id: string;
      eventType: string;
      eventCategory: string;
      status: string | null;
      count: number;
      latestAt: Date;
    }
  >();

  for (const event of events) {
    const groupingKey = `${event.eventCategory}:${event.eventType}:${event.status ?? "none"}`;
    const existing = grouped.get(groupingKey);

    if (!existing) {
      grouped.set(groupingKey, {
        id: groupingKey,
        eventType: event.eventType,
        eventCategory: event.eventCategory,
        status: event.status,
        count: 1,
        latestAt: event.createdAt,
      });
      continue;
    }

    existing.count += 1;
    if (event.createdAt > existing.latestAt) {
      existing.latestAt = event.createdAt;
    }
  }

  const lastReadAt = readState?.lastReadAt ?? null;
  const groupedBatches = Array.from(grouped.values());
  const batchesForSignalMode =
    signalMode === "all"
      ? groupedBatches
      : (() => {
          const high = groupedBatches.filter((batch) => HIGH_SIGNAL_EVENT_TYPES.has(batch.eventType));
          const low = groupedBatches.filter((batch) => !HIGH_SIGNAL_EVENT_TYPES.has(batch.eventType));

          if (low.length === 0) {
            return high;
          }

          const digestCount = low.reduce((sum, batch) => sum + batch.count, 0);
          const digestLatestAt = low.reduce(
            (latest, batch) => (batch.latestAt > latest ? batch.latestAt : latest),
            low[0].latestAt,
          );

          return [
            ...high,
            {
              id: "digest:low-priority",
              eventType: "digest.low-priority",
              eventCategory: "digest",
              status: null,
              count: digestCount,
              latestAt: digestLatestAt,
            },
          ];
        })();

  const notifications: NotificationBatch[] = batchesForSignalMode
    .sort((left, right) => right.latestAt.getTime() - left.latestAt.getTime())
    .slice(0, limit)
    .map((batch) => {
      const unread = lastReadAt ? batch.latestAt > lastReadAt : true;
      const isDigest = batch.eventType === "digest.low-priority";

      return {
        id: batch.id,
        eventType: batch.eventType,
        eventCategory: batch.eventCategory,
        status: batch.status,
        title: isDigest ? "Low-priority activity digest" : humanizeEventType(batch.eventType),
        description: isDigest
          ? `${batch.count} low-priority events were batched. Switch to All to review full detail.`
          : buildBatchDescription({
              eventCategory: batch.eventCategory,
              status: batch.status,
              count: batch.count,
            }),
        count: batch.count,
        latestAt: batch.latestAt.toISOString(),
        unread,
      };
    });

  const persistedNotifications: NotificationBatch[] = (storedNotificationSummary?.items ?? [])
    .filter((notification) => signalMode === "all" || HIGH_SIGNAL_EVENT_TYPES.has(notification.eventType))
    .map((notification) => ({
      id: notification.id,
      eventType: notification.eventType,
      eventCategory: notification.category,
      status: notification.readAt ? "read" : "unread",
      title: notification.title,
      description: notification.body,
      count: 1,
      latestAt: notification.createdAt,
      unread: notification.readAt === null,
    }));

  const mergedNotifications = [...persistedNotifications, ...notifications]
    .sort((left, right) => new Date(right.latestAt).getTime() - new Date(left.latestAt).getTime())
    .slice(0, limit);

  const unreadCount = mergedNotifications.reduce(
    (total, notification) => total + (notification.unread ? 1 : 0),
    0,
  );

  return NextResponse.json({
    notifications: mergedNotifications,
    unreadCount,
    signalMode,
    readState: {
      lastReadAt: lastReadAt?.toISOString() ?? null,
    },
  });
}
