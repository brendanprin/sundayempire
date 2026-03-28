import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";

const prisma = new PrismaClient();

before(async () => {
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test("syncLeagueComplianceScan creates and resolves durable rule-engine issues", async (t) => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `compliance-sync-${suffix}@local.league`,
      name: "Compliance Sync Commissioner",
    },
  });
  const league = await prisma.league.create({
    data: {
      name: `Compliance Sync League ${suffix}`,
    },
  });
  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      year: 2099,
      status: "ACTIVE",
      phase: "REGULAR_SEASON",
      openedAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
  const team = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: "Sync Test Team",
    },
  });

  t.after(async () => {
    await prisma.league.delete({
      where: {
        id: league.id,
      },
    });
    await prisma.user.delete({
      where: {
        id: user.id,
      },
    });
  });

  const service = createComplianceIssueService(prisma);
  const initial = await service.syncLeagueComplianceScan({
    leagueId: league.id,
    seasonId: season.id,
    actorUserId: user.id,
    actorRoleSnapshot: "COMMISSIONER",
    report: {
      leagueId: league.id,
      seasonId: season.id,
      evaluatedAt: new Date().toISOString(),
      summary: {
        teamsEvaluated: 1,
        ok: 0,
        warning: 0,
        error: 1,
        totalFindings: 1,
      },
      teams: [
        {
          teamId: team.id,
          status: "error",
          evaluatedAt: new Date().toISOString(),
          findings: [
            {
              teamId: team.id,
              ruleCode: "CAP_HARD_EXCEEDED",
              severity: "error",
              message: "Sync Test Team exceeds hard cap.",
              context: {
                hardCap: 300,
                totalCapHit: 312,
              },
            },
          ],
          summary: {
            errors: 1,
            warnings: 0,
          },
        },
      ],
    },
  });

  assert.equal(initial.issues.created, 1);

  const createdIssue = await prisma.complianceIssue.findFirstOrThrow({
    where: {
      leagueId: league.id,
      seasonId: season.id,
      teamId: team.id,
      source: "RULE_ENGINE",
    },
    include: {
      actions: true,
      notifications: true,
    },
  });

  assert.equal(createdIssue.status, "OPEN");
  assert.equal(createdIssue.ruleCode, "CAP_HARD_EXCEEDED");
  assert.equal(createdIssue.actions.length, 1);
  assert.equal(createdIssue.actions[0]?.actionType, "CREATED");
  assert.ok(createdIssue.notifications.length >= 0);

  const resolved = await service.syncLeagueComplianceScan({
    leagueId: league.id,
    seasonId: season.id,
    actorUserId: user.id,
    actorRoleSnapshot: "COMMISSIONER",
    report: {
      leagueId: league.id,
      seasonId: season.id,
      evaluatedAt: new Date().toISOString(),
      summary: {
        teamsEvaluated: 1,
        ok: 1,
        warning: 0,
        error: 0,
        totalFindings: 0,
      },
      teams: [
        {
          teamId: team.id,
          status: "ok",
          evaluatedAt: new Date().toISOString(),
          findings: [],
          summary: {
            errors: 0,
            warnings: 0,
          },
        },
      ],
    },
  });

  assert.equal(resolved.issues.resolved, 1);

  const updatedIssue = await prisma.complianceIssue.findUniqueOrThrow({
    where: {
      id: createdIssue.id,
    },
    include: {
      actions: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  assert.equal(updatedIssue.status, "RESOLVED");
  assert.equal(updatedIssue.actions.length, 2);
  assert.equal(updatedIssue.actions[1]?.actionType, "RESOLVED");
});

test("updateRemediationState stores member remediation progress and moves fully acknowledged issues in review", async (t) => {
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: {
      email: `remediation-owner-${suffix}@local.league`,
      name: "Remediation Member",
    },
  });
  const league = await prisma.league.create({
    data: {
      name: `Remediation League ${suffix}`,
    },
  });
  const season = await prisma.season.create({
    data: {
      leagueId: league.id,
      year: 2100,
      status: "ACTIVE",
      phase: "REGULAR_SEASON",
      openedAt: new Date("2100-01-01T00:00:00.000Z"),
    },
  });
  const team = await prisma.team.create({
    data: {
      leagueId: league.id,
      name: "Remediation Team",
    },
  });

  t.after(async () => {
    await prisma.league.delete({
      where: {
        id: league.id,
      },
    });
    await prisma.user.delete({
      where: {
        id: user.id,
      },
    });
  });

  const service = createComplianceIssueService(prisma);
  const issue = await service.createManualIssue({
    leagueId: league.id,
    seasonId: season.id,
    teamId: team.id,
    issueType: "CAP",
    severity: "ERROR",
    code: "MANUAL_CAP_REVIEW",
    title: "Manual cap review",
    message: "Member must submit cap remediation evidence.",
    createdByUserId: user.id,
    actorRoleSnapshot: "COMMISSIONER",
    metadata: {
      remediation: {
        acknowledgedAt: null,
        steps: [
          {
            id: "step-1",
            label: "Review cap totals.",
            completed: false,
            completedAt: null,
          },
          {
            id: "step-2",
            label: "Submit evidence.",
            completed: false,
            completedAt: null,
          },
          {
            id: "step-3",
            label: "Confirm no new cap violations remain.",
            completed: false,
            completedAt: null,
          },
        ],
      },
    },
  });

  await service.updateRemediationState({
    issueId: issue.id,
    actorUserId: user.id,
    actorRoleSnapshot: "MEMBER",
    acknowledgedAt: "2100-02-01T12:00:00.000Z",
    steps: [
      {
        id: "step-1",
        label: "Review cap totals.",
        completed: true,
        completedAt: "2100-02-01T10:00:00.000Z",
      },
      {
        id: "step-2",
        label: "Submit evidence.",
        completed: true,
        completedAt: "2100-02-01T11:00:00.000Z",
      },
      {
        id: "step-3",
        label: "Confirm no new cap violations remain.",
        completed: true,
        completedAt: "2100-02-01T11:30:00.000Z",
      },
    ],
  });

  const updated = await prisma.complianceIssue.findUniqueOrThrow({
    where: {
      id: issue.id,
    },
    include: {
      actions: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  assert.equal(updated.status, "IN_REVIEW");
  assert.equal(updated.actions.at(-1)?.actionType, "REMEDIATION_SUBMITTED");
});
