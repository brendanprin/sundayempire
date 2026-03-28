import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";

const prisma = new PrismaClient();

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("recordOverride persists override rows and notification hooks", async (t) => {
  const suffix = randomUUID();
  const commissioner = await prisma.user.create({
    data: {
      email: `override-commissioner-${suffix}@local.league`,
      name: "Override Commissioner",
    },
  });
  const owner = await prisma.user.create({
    data: {
      email: `override-owner-${suffix}@local.league`,
      name: "Override Owner",
    },
  });
  const league = await prisma.league.create({
    data: {
      name: `Override League ${suffix}`,
    },
  });
  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      year: 2096,
      status: "ACTIVE",
      phase: "PRESEASON_SETUP",
      openedAt: new Date("2096-01-01T00:00:00.000Z"),
    },
  });
  const team = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: "Override Team",
    },
  });

  await prisma.leagueMembership.createMany({
    data: [
      {
        userId: commissioner.id,
        leagueId: league.id,
        role: "COMMISSIONER",
      },
      {
        userId: owner.id,
        leagueId: league.id,
        teamId: team.id,
        role: "MEMBER",
      },
    ],
  });
  await prisma.teamMembership.create({
    data: {
      teamId: team.id,
      userId: owner.id,
      membershipType: "PRIMARY_MANAGER",
    },
  });

  t.after(async () => {
    await prisma.league.delete({
      where: {
        id: league.id,
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [commissioner.id, owner.id],
        },
      },
    });
  });

  const override = await createCommissionerOverrideService(prisma).recordOverride({
    leagueId: league.id,
    seasonId: season.id,
    teamId: team.id,
    actorUserId: commissioner.id,
    actorRoleSnapshot: "COMMISSIONER",
    overrideType: "MANUAL_RULING",
    reason: "Rule citation documented and team notified.",
    entityType: "trade",
    entityId: "trade:test-dispute",
    metadata: {
      disputeTitle: "Trade dispute",
    },
    notificationTitle: "Commissioner ruling published",
    notificationBody: "Rule citation documented and team notified.",
  });

  assert.equal(override.overrideType, "MANUAL_RULING");

  const storedOverride = await prisma.commissionerOverride.findUniqueOrThrow({
    where: {
      id: override.id,
    },
  });
  assert.equal(storedOverride.reason, "Rule citation documented and team notified.");

  const notifications = await prisma.notification.findMany({
    where: {
      overrideId: override.id,
    },
    orderBy: {
      recipientUserId: "asc",
    },
  });

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.recipientUserId, owner.id);
  assert.equal(notifications[0]?.title, "Commissioner ruling published");
});
