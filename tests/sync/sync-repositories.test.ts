import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createHostPlatformSyncJobRepository } from "@/lib/repositories/sync/host-platform-sync-job-repository";
import { createSyncMismatchRepository } from "@/lib/repositories/sync/sync-mismatch-repository";

test("host platform sync job repository create applies safe defaults", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createHostPlatformSyncJobRepository({
    hostPlatformSyncJob: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    leagueId: "league-1",
    seasonId: "season-1",
    jobType: "FULL_SYNC",
    trigger: "CSV_UPLOAD",
    adapterKey: "csv-manual",
    inputJson: null,
  });

  assert.deepEqual(capturedData, {
    leagueId: "league-1",
    seasonId: "season-1",
    requestedByUserId: null,
    jobType: "FULL_SYNC",
    status: "PENDING",
    trigger: "CSV_UPLOAD",
    adapterKey: "csv-manual",
    sourceLabel: null,
    sourceSnapshotAt: null,
    startedAt: null,
    completedAt: null,
    payloadDigest: null,
    inputJson: Prisma.DbNull,
    summaryJson: undefined,
    errorJson: undefined,
  });
});

test("sync mismatch repository create applies open defaults and nullable JSON handling", async () => {
  let capturedData:
    | (Record<string, unknown> & {
        firstDetectedAt: Date;
        lastDetectedAt: Date;
      })
    | null = null;

  const repository = createSyncMismatchRepository({
    syncMismatch: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data as Record<string, unknown> & {
          firstDetectedAt: Date;
          lastDetectedAt: Date;
        };
        return args.data;
      },
    },
  } as never);

  await repository.create({
    leagueId: "league-1",
    seasonId: "season-1",
    jobId: "job-1",
    mismatchType: "ROSTER_TEAM_DIFFERENCE",
    severity: "HIGH_IMPACT",
    fingerprint: "fp-1",
    title: "Roster mismatch",
    message: "Player is assigned to a different team in the host platform.",
    hostValueJson: null,
  });

  if (!capturedData) {
    throw new Error("expected mismatch create payload");
  }
  const persisted = capturedData as Record<string, unknown> & {
    firstDetectedAt: Date;
    lastDetectedAt: Date;
  };

  assert.deepEqual(persisted, {
    leagueId: "league-1",
    seasonId: "season-1",
    jobId: "job-1",
    teamId: null,
    playerId: null,
    rosterAssignmentId: null,
    complianceIssueId: null,
    mismatchType: "ROSTER_TEAM_DIFFERENCE",
    severity: "HIGH_IMPACT",
    status: "OPEN",
    resolutionType: null,
    fingerprint: "fp-1",
    title: "Roster mismatch",
    message: "Player is assigned to a different team in the host platform.",
    hostPlatformReferenceId: null,
    hostValueJson: Prisma.DbNull,
    dynastyValueJson: undefined,
    metadataJson: undefined,
    detectionCount: 1,
    firstDetectedAt: persisted.firstDetectedAt,
    lastDetectedAt: persisted.lastDetectedAt,
    resolvedAt: null,
    resolvedByUserId: null,
    resolutionReason: null,
  });

  assert.ok(persisted.firstDetectedAt instanceof Date);
  assert.ok(persisted.lastDetectedAt instanceof Date);
});

test("sync mismatch repository update writes resolution fields", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createSyncMismatchRepository({
    syncMismatch: {
      async update(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  const resolvedAt = new Date("2026-03-21T18:45:00.000Z");

  await repository.update("mismatch-1", {
    complianceIssueId: "issue-1",
    status: "ESCALATED",
    resolutionType: "ESCALATE_TO_COMPLIANCE",
    resolvedAt,
    resolvedByUserId: "user-1",
    resolutionReason: "Escalated due to cap impact.",
  });

  assert.deepEqual(capturedData, {
    teamId: undefined,
    playerId: undefined,
    rosterAssignmentId: undefined,
    complianceIssueId: "issue-1",
    mismatchType: undefined,
    severity: undefined,
    status: "ESCALATED",
    resolutionType: "ESCALATE_TO_COMPLIANCE",
    fingerprint: undefined,
    title: undefined,
    message: undefined,
    hostPlatformReferenceId: undefined,
    hostValueJson: undefined,
    dynastyValueJson: undefined,
    metadataJson: undefined,
    detectionCount: undefined,
    firstDetectedAt: undefined,
    lastDetectedAt: undefined,
    resolvedAt,
    resolvedByUserId: "user-1",
    resolutionReason: "Escalated due to cap impact.",
  });
});
