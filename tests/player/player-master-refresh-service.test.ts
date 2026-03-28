import assert from "node:assert/strict";
import test from "node:test";
import { createPlayerMasterRefreshService } from "@/lib/domain/player/player-master-refresh-service";

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
  createdAt: Date;
  updatedAt: Date;
};

type StoredRefreshJob = Record<string, unknown> & {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
};

type StoredRefreshChange = Record<string, unknown> & {
  id: string;
  changeType: string;
  reviewStatus: string;
};

type StoredSnapshot = Record<string, unknown> & {
  id: string;
  playerId: string;
  refreshJobId: string | null;
};

type RefreshHarnessOptions = {
  players?: StoredPlayer[];
  approvedMappings?: Array<{
    playerId: string;
    sourceKey: string;
    sourcePlayerId: string;
  }>;
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
    createdAt: input.createdAt ?? new Date("2026-03-26T12:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-03-26T12:00:00.000Z"),
  };
}

function createRefreshHarness(options: RefreshHarnessOptions = {}) {
  const players = [...(options.players ?? [])];
  const approvedMappings = [...(options.approvedMappings ?? [])];
  const jobs: StoredRefreshJob[] = [];
  const changes: StoredRefreshChange[] = [];
  const snapshots: StoredSnapshot[] = [];
  let jobCounter = 1;
  let playerCounter = players.length + 1;
  let changeCounter = 1;
  let snapshotCounter = 1;

  const client = {
    playerRefreshJob: {
      async create(args: { data: Record<string, unknown> }) {
        const job = {
          id: `job-${jobCounter++}`,
          createdAt: new Date("2026-03-26T12:00:00.000Z"),
          updatedAt: new Date("2026-03-26T12:00:00.000Z"),
          requestedByUser: null,
          _count: {
            changes: 0,
            snapshots: 0,
          },
          ...(args.data as Record<string, unknown>),
        } as unknown as StoredRefreshJob;
        jobs.push(job);
        return job;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const job = jobs.find((entry) => entry.id === args.where.id);
        if (!job) {
          throw new Error("missing job");
        }
        Object.assign(job, args.data, {
          updatedAt: new Date("2026-03-26T12:05:00.000Z"),
        });
        return job;
      },
    },
    playerRefreshChange: {
      async create(args: { data: Record<string, unknown> }) {
        const change = {
          id: `change-${changeCounter++}`,
          createdAt: new Date("2026-03-26T12:01:00.000Z"),
          updatedAt: new Date("2026-03-26T12:01:00.000Z"),
          ...(args.data as Record<string, unknown>),
        } as unknown as StoredRefreshChange;
        changes.push(change);
        return change;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const change = changes.find((entry) => entry.id === args.where.id);
        if (!change) {
          throw new Error("missing change");
        }
        Object.assign(change, args.data, {
          updatedAt: new Date("2026-03-26T12:06:00.000Z"),
        });
        return change;
      },
    },
    playerSeasonSnapshot: {
      async create(args: { data: Record<string, unknown> }) {
        const existing = snapshots.find(
          (snapshot) =>
            snapshot.refreshJobId === (args.data.refreshJobId as string | null) &&
            snapshot.playerId === args.data.playerId,
        );
        if (existing) {
          throw new Error("duplicate snapshot");
        }

        const snapshot = {
          id: `snapshot-${snapshotCounter++}`,
          createdAt: new Date("2026-03-26T12:02:00.000Z"),
          ...(args.data as Record<string, unknown>),
        } as unknown as StoredSnapshot;
        snapshots.push(snapshot);
        return snapshot;
      },
    },
    player: {
      async findMany() {
        return [...players];
      },
      async create(args: { data: Omit<StoredPlayer, "id" | "createdAt" | "updatedAt"> }) {
        const duplicate = players.find(
          (player) =>
            player.sourceKey === args.data.sourceKey &&
            player.sourcePlayerId === args.data.sourcePlayerId,
        );
        if (duplicate && args.data.sourceKey && args.data.sourcePlayerId) {
          throw new Error("duplicate player source identity");
        }

        const player = createPlayer({
          id: `player-${playerCounter++}`,
          ...args.data,
        });
        players.push(player);
        return player;
      },
      async update(args: {
        where: { id: string };
        data: Partial<Omit<StoredPlayer, "id" | "createdAt" | "updatedAt">>;
      }) {
        const player = players.find((entry) => entry.id === args.where.id);
        if (!player) {
          throw new Error("missing player");
        }

        Object.assign(player, args.data, {
          updatedAt: new Date("2026-03-26T12:03:00.000Z"),
        });
        return player;
      },
    },
    playerIdentityMapping: {
      async findMany() {
        return [...approvedMappings];
      },
    },
  };

  return {
    client,
    players,
    jobs,
    changes,
    snapshots,
  };
}

test("player master refresh is idempotent for repeated source-identical rows", async () => {
  const harness = createRefreshHarness();
  const service = createPlayerMasterRefreshService(harness.client as never);
  const payload = {
    format: "json" as const,
    players: [
      {
        sourceKey: "sleeper",
        sourcePlayerId: "1001",
        externalId: "legacy-1001",
        name: "Alpha QB",
        position: "QB",
        nflTeam: "ATL",
        statusText: "Healthy",
      },
    ],
  };

  const firstRun = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    adapterKey: "csv-manual",
    payload,
    now: new Date("2026-03-26T12:00:00.000Z"),
  });

  assert.equal(firstRun.job.status, "SUCCEEDED");
  assert.equal(firstRun.summary.new, 1);
  assert.equal(harness.players.length, 1);

  const secondRun = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    adapterKey: "csv-manual",
    payload,
    now: new Date("2026-03-26T12:10:00.000Z"),
  });

  assert.equal(secondRun.job.status, "SUCCEEDED");
  assert.equal(secondRun.summary.new, 0);
  assert.equal(secondRun.summary.unchanged, 1);
  assert.equal(secondRun.summary.totalProcessed, 1);
  assert.equal(harness.players.length, 1);
  assert.equal(harness.snapshots.length, 2);
  assert.deepEqual(
    harness.changes.map((change) => change.changeType),
    ["NEW", "UNCHANGED"],
  );
});

test("player master refresh records ambiguous fallback matches for later review", async () => {
  const harness = createRefreshHarness({
    players: [
      createPlayer({
        id: "player-a",
        name: "Casey WR",
        sourceKey: "seed-a",
        sourcePlayerId: "casey-a",
        nflTeam: "BUF",
        position: "WR",
      }),
      createPlayer({
        id: "player-b",
        name: "Casey WR",
        sourceKey: "seed-b",
        sourcePlayerId: "casey-b",
        nflTeam: "KC",
        position: "WR",
      }),
    ],
  });
  const service = createPlayerMasterRefreshService(harness.client as never);

  const result = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    adapterKey: "csv-manual",
    payload: {
      format: "json",
      players: [
        {
          name: "Casey WR",
          position: "WR",
        },
      ],
    },
    now: new Date("2026-03-26T12:20:00.000Z"),
  });

  assert.equal(result.job.status, "FAILED");
  assert.equal(result.summary.ambiguous, 1);
  assert.equal(result.summary.totalProcessed, 0);
  assert.equal(harness.players.length, 2);
  assert.equal(harness.snapshots.length, 0);
  assert.equal(harness.changes[0]?.changeType, "AMBIGUOUS");
  assert.equal(harness.changes[0]?.reviewStatus, "PENDING");
});

test("player master refresh flags duplicate-suspect identity collisions instead of merging", async () => {
  const harness = createRefreshHarness({
    players: [
      createPlayer({
        id: "player-primary",
        name: "Collision RB",
        externalId: "legacy-primary",
        sourceKey: "sleeper",
        sourcePlayerId: "2001",
        nflTeam: "DET",
        position: "RB",
      }),
      createPlayer({
        id: "player-conflict",
        name: "Collision RB Old",
        externalId: "legacy-conflict",
        sourceKey: "csv-manual",
        sourcePlayerId: "collision-rb-old",
        nflTeam: "DET",
        position: "RB",
      }),
    ],
  });
  const service = createPlayerMasterRefreshService(harness.client as never);

  const result = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    adapterKey: "csv-manual",
    payload: {
      format: "json",
      players: [
        {
          sourceKey: "sleeper",
          sourcePlayerId: "2001",
          externalId: "legacy-conflict",
          name: "Collision RB",
          position: "RB",
          nflTeam: "DET",
        },
      ],
    },
    now: new Date("2026-03-26T12:30:00.000Z"),
  });

  assert.equal(result.job.status, "FAILED");
  assert.equal(result.summary.duplicateSuspect, 1);
  assert.equal(result.summary.totalProcessed, 0);
  assert.equal(harness.players.length, 2);
  assert.equal(harness.snapshots.length, 0);
  assert.equal(harness.changes[0]?.changeType, "DUPLICATE_SUSPECT");
  assert.equal(harness.changes[0]?.reviewStatus, "PENDING");
});
