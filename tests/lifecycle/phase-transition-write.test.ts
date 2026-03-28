import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { transitionSeasonPhase } from "@/lib/commissioner/season";

const prisma = new PrismaClient();

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("transitionSeasonPhase persists a LeaguePhaseTransition row", async (t) => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `lifecycle-test-${suffix}@local.league`,
      name: "Lifecycle Test User",
    },
  });

  const league = await prisma.league.create({
    data: {
      name: `Lifecycle Test League ${suffix}`,
      description: "Temporary Sprint 1 lifecycle verification league.",
    },
  });

  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      year: 2099,
      status: "ACTIVE",
      phase: "PRESEASON_SETUP",
      openedAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });

  t.after(async () => {
    await prisma.league.delete({
      where: { id: league.id },
    });
    await prisma.user.delete({
      where: { id: user.id },
    });
  });

  const result = await transitionSeasonPhase({
    leagueId: league.id,
    seasonId: season.id,
    nextPhase: "REGULAR_SEASON",
    initiatedByUserId: user.id,
    initiatedByType: "COMMISSIONER",
    reason: "verification test",
    actor: "tests/lifecycle/phase-transition-write.test.ts",
  });

  assert.equal(result.changed, true);
  assert.equal(result.season.phase, "REGULAR_SEASON");

  const transitions = await prisma.leaguePhaseTransition.findMany({
    where: {
      leagueId: league.id,
      seasonId: season.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  assert.equal(transitions.length, 1);
  assert.equal(transitions[0]?.fromPhase, "PRESEASON_SETUP");
  assert.equal(transitions[0]?.toPhase, "REGULAR_SEASON");
  assert.equal(transitions[0]?.initiatedByUserId, user.id);
  assert.equal(transitions[0]?.initiatedByType, "COMMISSIONER");
  assert.equal(transitions[0]?.reason, "verification test");
  assert.equal(transitions[0]?.transitionStatus, "SUCCESS");
});
