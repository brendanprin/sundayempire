import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ComplianceNotificationDbClient = PrismaClient | Prisma.TransactionClient;

async function resolveCommissionerUserIds(
  client: ComplianceNotificationDbClient,
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
  client: ComplianceNotificationDbClient,
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

function uniqueUserIds(userIds: Array<string | null | undefined>) {
  return [...new Set(userIds.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

export function createComplianceNotificationService(
  client: ComplianceNotificationDbClient = prisma,
) {
  return {
    async notifyComplianceIssue(input: {
      leagueId: string;
      seasonId?: string | null;
      teamId?: string | null;
      issueId: string;
      title: string;
      body: string;
      eventType: string;
      dedupeKey?: string | null;
      actorUserId?: string | null;
      actionId?: string | null;
      overrideId?: string | null;
    }) {
      const recipients = uniqueUserIds([
        ...(await resolveCommissionerUserIds(client, input.leagueId)),
        ...(input.teamId
          ? await resolveTeamUserIds(client, {
              leagueId: input.leagueId,
              teamId: input.teamId,
            })
          : []),
      ]).filter((userId) => userId !== input.actorUserId);

      if (recipients.length === 0) {
        return { count: 0 };
      }

      return client.notification.createMany({
        data: recipients.map((recipientUserId) => ({
          leagueId: input.leagueId,
          seasonId: input.seasonId ?? null,
          recipientUserId,
          teamId: input.teamId ?? null,
          issueId: input.issueId,
          actionId: input.actionId ?? null,
          overrideId: input.overrideId ?? null,
          eventType: input.eventType,
          title: input.title,
          body: input.body,
          dedupeKey: input.dedupeKey ?? null,
        })),
      });
    },

    async notifyOverride(input: {
      leagueId: string;
      seasonId?: string | null;
      teamId?: string | null;
      overrideId: string;
      issueId?: string | null;
      actionId?: string | null;
      title: string;
      body: string;
      actorUserId?: string | null;
      dedupeKey?: string | null;
    }) {
      const recipients = uniqueUserIds([
        ...(await resolveCommissionerUserIds(client, input.leagueId)),
        ...(input.teamId
          ? await resolveTeamUserIds(client, {
              leagueId: input.leagueId,
              teamId: input.teamId,
            })
          : []),
      ]).filter((userId) => userId !== input.actorUserId);

      if (recipients.length === 0) {
        return { count: 0 };
      }

      return client.notification.createMany({
        data: recipients.map((recipientUserId) => ({
          leagueId: input.leagueId,
          seasonId: input.seasonId ?? null,
          recipientUserId,
          teamId: input.teamId ?? null,
          issueId: input.issueId ?? null,
          actionId: input.actionId ?? null,
          overrideId: input.overrideId,
          eventType: "commissioner.override.recorded",
          title: input.title,
          body: input.body,
          dedupeKey: input.dedupeKey ?? null,
        })),
      });
    },
  };
}
