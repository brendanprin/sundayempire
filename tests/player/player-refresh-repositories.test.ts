import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { createPlayerIdentityMappingRepository } from "@/lib/repositories/player/player-identity-mapping-repository";
import { createPlayerRefreshChangeRepository } from "@/lib/repositories/player/player-refresh-change-repository";
import { createPlayerRefreshJobRepository } from "@/lib/repositories/player/player-refresh-job-repository";
import { createPlayerSeasonSnapshotRepository } from "@/lib/repositories/player/player-season-snapshot-repository";

test("player refresh job repository create applies safe defaults", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createPlayerRefreshJobRepository({
    playerRefreshJob: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    leagueId: "league-1",
    seasonId: "season-1",
    adapterKey: "csv-manual",
    inputJson: null,
  });

  assert.deepEqual(capturedData, {
    leagueId: "league-1",
    seasonId: "season-1",
    requestedByUserId: null,
    adapterKey: "csv-manual",
    sourceLabel: null,
    status: "PENDING",
    startedAt: null,
    completedAt: null,
    payloadDigest: null,
    inputJson: Prisma.DbNull,
    summaryJson: undefined,
    errorJson: undefined,
  });
});

test("player season snapshot repository create persists season-scoped player truth", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createPlayerSeasonSnapshotRepository({
    playerSeasonSnapshot: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  const capturedAt = new Date("2026-03-26T14:00:00.000Z");

  await repository.create({
    playerId: "player-1",
    leagueId: "league-1",
    seasonId: "season-1",
    refreshJobId: "job-1",
    sourceKey: "fantasypros-draft-rankings",
    sourcePlayerId: "fantasypros-draft-rankings-v1-jamarr-chase",
    externalId: "fantasypros-draft-rankings-v1-jamarr-chase",
    name: "Ja'Marr Chase",
    displayName: "Ja'Marr Chase",
    searchName: "ja'marr chase",
    position: "WR",
    nflTeam: "CIN",
    capturedAt,
  });

  assert.deepEqual(capturedData, {
    playerId: "player-1",
    leagueId: "league-1",
    seasonId: "season-1",
    refreshJobId: "job-1",
    sourceKey: "fantasypros-draft-rankings",
    sourcePlayerId: "fantasypros-draft-rankings-v1-jamarr-chase",
    externalId: "fantasypros-draft-rankings-v1-jamarr-chase",
    name: "Ja'Marr Chase",
    displayName: "Ja'Marr Chase",
    searchName: "ja'marr chase",
    position: "WR",
    nflTeam: "CIN",
    age: null,
    yearsPro: null,
    injuryStatus: null,
    statusCode: null,
    statusText: null,
    isRestricted: false,
    capturedAt,
  });
});

test("player refresh change repository handles nullable JSON and review updates", async () => {
  let createdData: Record<string, unknown> | null = null;
  let updatedData: Record<string, unknown> | null = null;

  const repository = createPlayerRefreshChangeRepository({
    playerRefreshChange: {
      async create(args: { data: Record<string, unknown> }) {
        createdData = args.data;
        return args.data;
      },
      async update(args: { data: Record<string, unknown> }) {
        updatedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    leagueId: "league-1",
    seasonId: "season-1",
    jobId: "job-1",
    playerId: "player-1",
    changeType: "UPDATED",
    previousValuesJson: null,
    incomingValuesJson: {
      nflTeam: "BUF",
    },
  });

  assert.deepEqual(createdData, {
    leagueId: "league-1",
    seasonId: "season-1",
    jobId: "job-1",
    playerId: "player-1",
    snapshotId: null,
    changeType: "UPDATED",
    reviewStatus: "PENDING",
    fieldMaskJson: undefined,
    previousValuesJson: Prisma.DbNull,
    incomingValuesJson: {
      nflTeam: "BUF",
    },
    appliedValuesJson: undefined,
    notes: null,
    reviewedAt: null,
    reviewedByUserId: null,
  });

  const reviewedAt = new Date("2026-03-26T15:00:00.000Z");

  await repository.update("change-1", {
    reviewStatus: "APPROVED",
    appliedValuesJson: {
      nflTeam: "BUF",
    },
    reviewedAt,
    reviewedByUserId: "user-1",
    notes: "Validated against provider export.",
  });

  assert.deepEqual(updatedData, {
    playerId: undefined,
    snapshotId: undefined,
    changeType: undefined,
    reviewStatus: "APPROVED",
    fieldMaskJson: undefined,
    previousValuesJson: undefined,
    incomingValuesJson: undefined,
    appliedValuesJson: {
      nflTeam: "BUF",
    },
    notes: "Validated against provider export.",
    reviewedAt,
    reviewedByUserId: "user-1",
  });
});

test("player identity mapping repository persists approved canonical mappings", async () => {
  let createdData:
    | (Record<string, unknown> & {
        approvedAt: Date;
      })
    | null = null;

  const repository = createPlayerIdentityMappingRepository({
    playerIdentityMapping: {
      async create(args: { data: Record<string, unknown> }) {
        createdData = args.data as typeof createdData;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    playerId: "player-1",
    sourceKey: "sleeper",
    sourcePlayerId: "1001",
    approvedByUserId: "user-1",
    notes: "Validated by commissioner refresh review.",
  });

  if (!createdData) {
    throw new Error("expected identity mapping create payload");
  }
  const persisted = createdData as Record<string, unknown> & {
    approvedAt: Date;
  };

  assert.deepEqual(persisted, {
    playerId: "player-1",
    sourceKey: "sleeper",
    sourcePlayerId: "1001",
    approvedByUserId: "user-1",
    notes: "Validated by commissioner refresh review.",
    approvedAt: persisted.approvedAt,
  });
  assert.ok(persisted.approvedAt instanceof Date);
});
