import assert from "node:assert/strict";
import test from "node:test";
import { createCommissionerPlayerRefreshService } from "@/lib/domain/player/player-refresh-review-service";

type StoredPlayer = {
  id: string;
  sourceKey: string | null;
  sourcePlayerId: string | null;
  externalId: string | null;
  name: string;
  displayName: string;
  searchName: string;
  position: "QB" | "RB" | "WR" | "TE" | "K" | "DST";
  nflTeam: string | null;
  age: number | null;
  yearsPro: number | null;
  injuryStatus: string | null;
  statusCode: string | null;
  statusText: string | null;
  isRestricted: boolean;
};

type StoredChange = {
  id: string;
  leagueId: string;
  seasonId: string;
  jobId: string;
  playerId: string | null;
  snapshotId: string | null;
  changeType: string;
  reviewStatus: string;
  fieldMaskJson: unknown;
  previousValuesJson: unknown;
  incomingValuesJson: unknown;
  appliedValuesJson: unknown;
  notes: string | null;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  job: {
    id: string;
    adapterKey: string;
    status: string;
    createdAt: Date;
  };
  player:
    | {
        id: string;
        name: string;
        displayName: string;
        position: string;
        nflTeam: string | null;
      }
    | null;
  snapshot:
    | {
        id: string;
        seasonId: string;
        capturedAt: Date;
      }
    | null;
  reviewedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
};

type StoredSnapshot = {
  id: string;
  playerId: string;
  refreshJobId: string | null;
  seasonId: string;
  capturedAt: Date;
};

type StoredMapping = {
  id: string;
  playerId: string;
  sourceKey: string;
  sourcePlayerId: string;
  approvedByUserId: string | null;
  notes: string | null;
  approvedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type ReviewHarnessOptions = {
  players?: StoredPlayer[];
  changes?: StoredChange[];
  mappings?: StoredMapping[];
};

function createPlayer(
  input: Partial<StoredPlayer> & Pick<StoredPlayer, "id" | "name" | "position">,
): StoredPlayer {
  const displayName = input.displayName ?? input.name;

  return {
    id: input.id,
    sourceKey: input.sourceKey ?? null,
    sourcePlayerId: input.sourcePlayerId ?? null,
    externalId: input.externalId ?? null,
    name: input.name,
    displayName,
    searchName: input.searchName ?? displayName.toLowerCase(),
    position: input.position,
    nflTeam: input.nflTeam ?? null,
    age: input.age ?? null,
    yearsPro: input.yearsPro ?? null,
    injuryStatus: input.injuryStatus ?? null,
    statusCode: input.statusCode ?? null,
    statusText: input.statusText ?? null,
    isRestricted: input.isRestricted ?? false,
  };
}

function buildPlayerSummary(player: StoredPlayer | undefined | null) {
  if (!player) {
    return null;
  }

  return {
    id: player.id,
    name: player.name,
    displayName: player.displayName,
    position: player.position,
    nflTeam: player.nflTeam,
  };
}

function createPendingChange(input: {
  id: string;
  incomingValuesJson: Record<string, unknown>;
  playerId?: string | null;
  changeType?: string;
  notes?: string | null;
  players: StoredPlayer[];
}): StoredChange {
  const player = input.players.find((entry) => entry.id === (input.playerId ?? null)) ?? null;

  return {
    id: input.id,
    leagueId: "league-1",
    seasonId: "season-1",
    jobId: "job-1",
    playerId: input.playerId ?? null,
    snapshotId: null,
    changeType: input.changeType ?? "AMBIGUOUS",
    reviewStatus: "PENDING",
    fieldMaskJson: null,
    previousValuesJson: null,
    incomingValuesJson: input.incomingValuesJson,
    appliedValuesJson: null,
    notes: input.notes ?? "Needs review.",
    reviewedAt: null,
    reviewedByUserId: null,
    createdAt: new Date("2026-03-26T12:00:00.000Z"),
    updatedAt: new Date("2026-03-26T12:00:00.000Z"),
    job: {
      id: "job-1",
      adapterKey: "csv-manual",
      status: "PARTIAL",
      createdAt: new Date("2026-03-26T12:00:00.000Z"),
    },
    player: buildPlayerSummary(player),
    snapshot: null,
    reviewedByUser: null,
  };
}

function createReviewHarness(options: ReviewHarnessOptions = {}) {
  const players = [...(options.players ?? [])];
  const changes = [...(options.changes ?? [])];
  const mappings = [...(options.mappings ?? [])];
  const snapshots: StoredSnapshot[] = [];
  const transactions: Array<Record<string, unknown>> = [];
  let snapshotCounter = 1;
  let mappingCounter = 1;

  const client = {
    transaction: {
      async create(args: { data: Record<string, unknown> }) {
        transactions.push(args.data);
        return args.data;
      },
    },
    player: {
      async findUnique(args: { where: { id: string } }) {
        return players.find((player) => player.id === args.where.id) ?? null;
      },
      async update(args: {
        where: { id: string };
        data: Partial<StoredPlayer>;
      }) {
        const player = players.find((entry) => entry.id === args.where.id);
        if (!player) {
          throw new Error("missing player");
        }

        Object.assign(player, args.data);
        return player;
      },
    },
    playerRefreshChange: {
      async findUnique(args: { where: { id: string } }) {
        return changes.find((change) => change.id === args.where.id) ?? null;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const change = changes.find((entry) => entry.id === args.where.id);
        if (!change) {
          throw new Error("missing change");
        }

        Object.assign(change, args.data, {
          updatedAt: new Date("2026-03-26T12:30:00.000Z"),
        });

        if ("playerId" in args.data) {
          const playerId =
            typeof args.data.playerId === "string" ? args.data.playerId : null;
          change.playerId = playerId;
          change.player = buildPlayerSummary(
            players.find((player) => player.id === playerId) ?? null,
          );
        }

        if ("snapshotId" in args.data) {
          const snapshotId =
            typeof args.data.snapshotId === "string" ? args.data.snapshotId : null;
          change.snapshotId = snapshotId;
          const snapshot = snapshots.find((entry) => entry.id === snapshotId) ?? null;
          change.snapshot = snapshot
            ? {
                id: snapshot.id,
                seasonId: snapshot.seasonId,
                capturedAt: snapshot.capturedAt,
              }
            : null;
        }

        return change;
      },
    },
    playerIdentityMapping: {
      async findUnique(args: {
        where: {
          sourceKey_sourcePlayerId: {
            sourceKey: string;
            sourcePlayerId: string;
          };
        };
      }) {
        return (
          mappings.find(
            (mapping) =>
              mapping.sourceKey === args.where.sourceKey_sourcePlayerId.sourceKey &&
              mapping.sourcePlayerId === args.where.sourceKey_sourcePlayerId.sourcePlayerId,
          ) ?? null
        );
      },
      async create(args: { data: Record<string, unknown> }) {
        const mapping = {
          id: `mapping-${mappingCounter++}`,
          createdAt: new Date("2026-03-26T12:20:00.000Z"),
          updatedAt: new Date("2026-03-26T12:20:00.000Z"),
          ...(args.data as Omit<StoredMapping, "id" | "createdAt" | "updatedAt">),
        } as StoredMapping;
        mappings.push(mapping);
        return mapping;
      },
    },
    playerSeasonSnapshot: {
      async findFirst(args: { where: { refreshJobId: string; playerId: string } }) {
        return (
          snapshots.find(
            (snapshot) =>
              snapshot.refreshJobId === args.where.refreshJobId &&
              snapshot.playerId === args.where.playerId,
          ) ?? null
        );
      },
      async create(args: { data: Record<string, unknown> }) {
        const snapshot = {
          id: `snapshot-${snapshotCounter++}`,
          createdAt: new Date("2026-03-26T12:25:00.000Z"),
          ...(args.data as Omit<StoredSnapshot, "id">),
        } as StoredSnapshot & {
          createdAt: Date;
        };
        snapshots.push(snapshot);
        return snapshot;
      },
    },
  };

  return {
    client,
    players,
    changes,
    mappings,
    snapshots,
    transactions,
  };
}

test("commissioner refresh trigger delegates to the master refresh service", async () => {
  const harness = createReviewHarness();
  const calls: Array<Record<string, unknown>> = [];

  const service = createCommissionerPlayerRefreshService(harness.client as never, {
    masterRefreshService: {
      async run(input: Record<string, unknown>) {
        calls.push(input);
        return {
          job: {
            id: "job-123",
            status: "SUCCEEDED",
            adapterKey: "csv-manual",
            createdAt: "2026-03-26T12:00:00.000Z",
            completedAt: "2026-03-26T12:01:00.000Z",
          },
          summary: {
            new: 1,
            updated: 0,
            unchanged: 0,
            invalid: 0,
            ambiguous: 0,
            duplicateSuspect: 0,
            warnings: [],
            errors: [],
            totalSubmitted: 1,
            totalNormalized: 1,
            totalProcessed: 1,
          },
        };
      },
    },
  });

  const result = await service.triggerRefresh({
    leagueId: "league-1",
    seasonId: "season-1",
    adapterKey: "csv-manual",
    sourceLabel: "Runtime player import",
    requestedByUserId: "user-1",
    payload: {
      format: "json",
      players: [],
    },
    actor: {
      email: "commissioner@example.com",
      role: "COMMISSIONER",
      teamId: null,
    },
  });

  assert.equal(result.job.id, "job-123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.adapterKey, "csv-manual");
  assert.equal(calls[0]?.requestedByUserId, "user-1");
  assert.equal(harness.transactions.length, 1);
});

test("commissioner can apply an approved identity mapping and update a canonical player", async () => {
  const players = [
    createPlayer({
      id: "player-1",
      name: "Alpha QB",
      position: "QB",
      nflTeam: "ATL",
      sourceKey: null,
      sourcePlayerId: null,
      statusText: "Questionable",
      isRestricted: false,
    }),
  ];
  const harness = createReviewHarness({
    players,
    changes: [
      createPendingChange({
        id: "change-1",
        players,
        incomingValuesJson: {
          sourceKey: "sleeper",
          sourcePlayerId: "1001",
          externalId: "legacy-1001",
          name: "Alpha QB",
          displayName: "Alpha QB",
          searchName: "alpha qb",
          position: "QB",
          nflTeam: "ATL",
          statusText: "Healthy",
          isRestricted: false,
          raw: {},
        },
      }),
    ],
  });
  const service = createCommissionerPlayerRefreshService(harness.client as never);

  const result = await service.resolveChange({
    leagueId: "league-1",
    seasonId: "season-1",
    changeId: "change-1",
    reviewedByUserId: "user-1",
    now: new Date("2026-03-26T12:30:00.000Z"),
    action: {
      type: "APPLY_MAPPING",
      playerId: "player-1",
      restricted: true,
      notes: "Approved commissioner correction.",
    },
    actor: {
      email: "commissioner@example.com",
      role: "COMMISSIONER",
      teamId: null,
    },
  });

  assert.equal(result.reviewStatus, "APPLIED");
  assert.equal(result.mappingCreated, true);
  assert.equal(harness.mappings.length, 1);
  assert.equal(harness.snapshots.length, 1);
  assert.equal(harness.players[0]?.sourceKey, "sleeper");
  assert.equal(harness.players[0]?.sourcePlayerId, "1001");
  assert.equal(harness.players[0]?.statusText, "Healthy");
  assert.equal(harness.players[0]?.isRestricted, true);
  assert.equal(harness.changes[0]?.reviewStatus, "APPLIED");
  assert.equal(harness.changes[0]?.reviewedByUserId, "user-1");
  assert.equal(harness.transactions.length, 1);
});

test("commissioner can reject a pending refresh change without mutating players", async () => {
  const players = [
    createPlayer({
      id: "player-1",
      name: "Reject WR",
      position: "WR",
      nflTeam: "BUF",
    }),
  ];
  const harness = createReviewHarness({
    players,
    changes: [
      createPendingChange({
        id: "change-2",
        players,
        playerId: "player-1",
        changeType: "DUPLICATE_SUSPECT",
        incomingValuesJson: {
          sourceKey: "csv-manual",
          sourcePlayerId: "reject-wr",
          name: "Reject WR",
          displayName: "Reject WR",
          searchName: "reject wr",
          position: "WR",
          nflTeam: "BUF",
          raw: {},
        },
      }),
    ],
  });
  const service = createCommissionerPlayerRefreshService(harness.client as never);

  const result = await service.resolveChange({
    leagueId: "league-1",
    seasonId: "season-1",
    changeId: "change-2",
    reviewedByUserId: "user-2",
    action: {
      type: "REJECT",
      notes: "False positive duplicate.",
    },
  });

  assert.equal(result.reviewStatus, "REJECTED");
  assert.equal(harness.changes[0]?.reviewStatus, "REJECTED");
  assert.equal(harness.players[0]?.sourceKey, null);
  assert.equal(harness.mappings.length, 0);
  assert.equal(harness.snapshots.length, 0);
});

test("commissioner review refuses mapping collisions with an already approved canonical player", async () => {
  const players = [
    createPlayer({
      id: "player-1",
      name: "Conflict RB",
      position: "RB",
      nflTeam: "DET",
    }),
    createPlayer({
      id: "player-2",
      name: "Approved RB",
      position: "RB",
      nflTeam: "DET",
      sourceKey: "sleeper",
      sourcePlayerId: "2001",
    }),
  ];
  const harness = createReviewHarness({
    players,
    changes: [
      createPendingChange({
        id: "change-3",
        players,
        incomingValuesJson: {
          sourceKey: "sleeper",
          sourcePlayerId: "2001",
          name: "Conflict RB",
          displayName: "Conflict RB",
          searchName: "conflict rb",
          position: "RB",
          nflTeam: "DET",
          raw: {},
        },
      }),
    ],
    mappings: [
      {
        id: "mapping-existing",
        playerId: "player-2",
        sourceKey: "sleeper",
        sourcePlayerId: "2001",
        approvedByUserId: "user-existing",
        notes: null,
        approvedAt: new Date("2026-03-26T11:00:00.000Z"),
        createdAt: new Date("2026-03-26T11:00:00.000Z"),
        updatedAt: new Date("2026-03-26T11:00:00.000Z"),
      },
    ],
  });
  const service = createCommissionerPlayerRefreshService(harness.client as never);

  await assert.rejects(
    () =>
      service.resolveChange({
        leagueId: "league-1",
        seasonId: "season-1",
        changeId: "change-3",
        reviewedByUserId: "user-3",
        action: {
          type: "APPLY_MAPPING",
          playerId: "player-1",
        },
      }),
    /PLAYER_IDENTITY_MAPPING_CONFLICT/,
  );

  assert.equal(harness.changes[0]?.reviewStatus, "PENDING");
  assert.equal(harness.mappings.length, 1);
});

test("commissioner can mark a canonical player restricted outside a specific change decision", async () => {
  const harness = createReviewHarness({
    players: [
      createPlayer({
        id: "player-1",
        name: "Restriction TE",
        position: "TE",
        nflTeam: "KC",
        isRestricted: false,
      }),
    ],
  });
  const service = createCommissionerPlayerRefreshService(harness.client as never);

  const result = await service.updatePlayerRestriction({
    leagueId: "league-1",
    seasonId: "season-1",
    playerId: "player-1",
    restricted: true,
    reviewedByUserId: "user-9",
    notes: "Restricted during commissioner review.",
  });

  assert.equal(result.isRestricted, true);
  assert.equal(harness.players[0]?.isRestricted, true);
  assert.equal(harness.transactions.length, 1);
});
