import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createComplianceDueTimeCalculator } from "@/lib/domain/compliance/compliance-due-time-calculator";

const prisma = new PrismaClient();

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("compliance due-time calculator uses configured deadlines when present", async (t) => {
  const suffix = randomUUID();
  const league = await prisma.league.create({
    data: {
      name: `Due Time League ${suffix}`,
    },
  });
  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      year: 2098,
      status: "ACTIVE",
      phase: "TAG_OPTION_COMPLIANCE",
      openedAt: new Date("2098-01-01T00:00:00.000Z"),
    },
  });
  const deadline = await prisma.leagueDeadline.create({
    data: {
      leagueId: league.id,
      seasonId: season.id,
      phase: "TAG_OPTION_COMPLIANCE",
      deadlineType: "ROOKIE_OPTION",
      sourceType: "test",
      scheduledAt: new Date("2098-05-01T12:00:00.000Z"),
      reminderOffsetsJson: [7, 1],
    },
  });

  t.after(async () => {
    await prisma.league.delete({
      where: {
        id: league.id,
      },
    });
  });

  const result = await createComplianceDueTimeCalculator(prisma).calculate({
    leagueId: league.id,
    seasonId: season.id,
    issueType: "CONTRACT",
    severity: "ERROR",
    deadlineType: "ROOKIE_OPTION",
    now: new Date("2098-04-20T00:00:00.000Z"),
  });

  assert.equal(result.basis, "DEADLINE");
  assert.equal(result.leagueDeadlineId, deadline.id);
  assert.equal(result.dueAt?.toISOString(), "2098-05-01T12:00:00.000Z");
});

test("compliance due-time calculator falls back to phase windows when no deadline exists", async (t) => {
  const suffix = randomUUID();
  const league = await prisma.league.create({
    data: {
      name: `Phase Window League ${suffix}`,
    },
  });
  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      year: 2097,
      status: "ACTIVE",
      phase: "REGULAR_SEASON",
      openedAt: new Date("2097-01-01T00:00:00.000Z"),
    },
  });

  t.after(async () => {
    await prisma.league.delete({
      where: {
        id: league.id,
      },
    });
  });

  const now = new Date("2097-09-10T12:00:00.000Z");
  const result = await createComplianceDueTimeCalculator(prisma).calculate({
    leagueId: league.id,
    seasonId: season.id,
    issueType: "ROSTER",
    severity: "ERROR",
    now,
  });

  assert.equal(result.basis, "PHASE_WINDOW");
  assert.equal(result.leagueDeadlineId, null);
  assert.equal(result.dueAt?.toISOString(), "2097-09-11T12:00:00.000Z");
});
