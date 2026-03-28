import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type TradeNotificationDbClient = PrismaClient | Prisma.TransactionClient;

async function resolveCommissionerUserIds(
  client: TradeNotificationDbClient,
  leagueId: string,
) {
  const memberships = await client.leagueMembership.findMany({
    where: {
      leagueId,
      role: "COMMISSIONER",
    },
    select: {
      userId: true,
    },
  });

  return memberships.map((membership) => membership.userId);
}

async function resolveTeamUserIds(
  client: TradeNotificationDbClient,
  input: { leagueId: string; teamId: string },
) {
  const [teamMemberships, leagueMemberships] = await Promise.all([
    client.teamMembership.findMany({
      where: {
        teamId: input.teamId,
        isActive: true,
      },
      select: {
        userId: true,
      },
    }),
    client.leagueMembership.findMany({
      where: {
        leagueId: input.leagueId,
        teamId: input.teamId,
        role: {
          in: ["COMMISSIONER", "MEMBER"],
        },
      },
      select: {
        userId: true,
      },
    }),
  ]);

  return [
    ...teamMemberships.map((membership) => membership.userId),
    ...leagueMemberships.map((membership) => membership.userId),
  ];
}

function uniqueUserIds(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function createTradeNotificationService(
  client: TradeNotificationDbClient = prisma,
) {
  async function notifyUsers(input: {
    leagueId: string;
    seasonId: string;
    teamId: string | null;
    recipientUserIds: string[];
    eventType: string;
    title: string;
    body: string;
    dedupeKey: string;
  }) {
    if (input.recipientUserIds.length === 0) {
      return { count: 0 };
    }

    return client.notification.createMany({
      data: input.recipientUserIds.map((recipientUserId) => ({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        recipientUserId,
        teamId: input.teamId,
        eventType: input.eventType,
        title: input.title,
        body: input.body,
        dedupeKey: `${input.dedupeKey}:${recipientUserId}`,
      })),
    });
  }

  return {
    async notifyCounterpartySubmission(input: {
      leagueId: string;
      seasonId: string;
      counterpartyTeamId: string;
      actorUserId: string;
      title: string;
      body: string;
      dedupeKey: string;
    }) {
      const recipients = uniqueUserIds(
        await resolveTeamUserIds(client, {
          leagueId: input.leagueId,
          teamId: input.counterpartyTeamId,
        }),
      ).filter((userId) => userId !== input.actorUserId);

      return notifyUsers({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: input.counterpartyTeamId,
        recipientUserIds: recipients,
        eventType: "trade.proposal.submitted",
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
      });
    },

    async notifyCommissionerReview(input: {
      leagueId: string;
      seasonId: string;
      actorUserId: string;
      title: string;
      body: string;
      dedupeKey: string;
    }) {
      const recipients = uniqueUserIds(
        await resolveCommissionerUserIds(client, input.leagueId),
      ).filter((userId) => userId !== input.actorUserId);

      return notifyUsers({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: null,
        recipientUserIds: recipients,
        eventType: "trade.proposal.review_pending",
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
      });
    },

    async notifyProposalDecision(input: {
      leagueId: string;
      seasonId: string;
      proposerTeamId: string;
      counterpartyTeamId: string;
      actorUserId: string;
      eventType:
        | "trade.proposal.accepted"
        | "trade.proposal.declined"
        | "trade.proposal.review_approved"
        | "trade.proposal.review_rejected";
      title: string;
      body: string;
      dedupeKey: string;
    }) {
      const recipients = uniqueUserIds([
        ...(await resolveTeamUserIds(client, {
          leagueId: input.leagueId,
          teamId: input.proposerTeamId,
        })),
        ...(await resolveTeamUserIds(client, {
          leagueId: input.leagueId,
          teamId: input.counterpartyTeamId,
        })),
        ...(await resolveCommissionerUserIds(client, input.leagueId)),
      ]).filter((userId) => userId !== input.actorUserId);

      if (recipients.length === 0) {
        return { count: 0 };
      }

      return client.notification.createMany({
        data: recipients.map((recipientUserId) => ({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          recipientUserId,
          teamId: null,
          eventType: input.eventType,
          title: input.title,
          body: input.body,
          dedupeKey: `${input.dedupeKey}:${recipientUserId}`,
        })),
      });
    },
  };
}
