import assert from "node:assert/strict";
import test from "node:test";
import { createSyncRunService } from "@/lib/domain/sync/sync-run-service";

type StoredMismatch = {
  id: string;
  leagueId: string;
  seasonId: string;
  jobId: string;
  teamId: string | null;
  playerId: string | null;
  rosterAssignmentId: string | null;
  complianceIssueId: string | null;
  mismatchType: string;
  severity: string;
  status: string;
  resolutionType: string | null;
  fingerprint: string;
  title: string;
  message: string;
  hostPlatformReferenceId: string | null;
  hostValueJson: Record<string, unknown> | null;
  dynastyValueJson: Record<string, unknown> | null;
  metadataJson: Record<string, unknown> | null;
  detectionCount: number;
  firstDetectedAt: Date;
  lastDetectedAt: Date;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  resolutionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredPlayer = {
  id: string;
  name: string;
  displayName: string;
  searchName: string;
  externalId: string | null;
  sourceKey: string | null;
  sourcePlayerId: string | null;
  nflTeam: string | null;
  position: string;
};

type StoredRosterAssignment = {
  id: string;
  teamId: string;
  seasonId: string;
  playerId: string;
  rosterStatus: string;
  hostPlatformReferenceId: string | null;
  effectiveAt: Date;
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  player: StoredPlayer;
};

type StoredTransaction = {
  id: string;
  type: string;
  summary: string;
  createdAt: Date;
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  player: StoredPlayer | null;
};

type RunHarnessOptions = {
  players?: StoredPlayer[];
  approvedMappings?: Array<{
    playerId: string;
    sourceKey: string;
    sourcePlayerId: string;
  }>;
  assignments?: StoredRosterAssignment[];
  transactions?: StoredTransaction[];
  initialMismatches?: StoredMismatch[];
};

function createPlayer(input: Partial<StoredPlayer> & Pick<StoredPlayer, "id" | "name" | "position">): StoredPlayer {
  const displayName = input.displayName ?? input.name;

  return {
    id: input.id,
    name: input.name,
    displayName,
    searchName: input.searchName ?? displayName.toLowerCase(),
    externalId: input.externalId ?? null,
    sourceKey: input.sourceKey ?? null,
    sourcePlayerId: input.sourcePlayerId ?? null,
    nflTeam: input.nflTeam ?? null,
    position: input.position,
  };
}

function createAssignment(input: {
  id: string;
  teamId: string;
  seasonId: string;
  player: StoredPlayer;
  rosterStatus?: string;
  hostPlatformReferenceId?: string | null;
  effectiveAt?: Date;
}) {
  const team =
    input.teamId === "team-2"
      ? {
          id: "team-2",
          name: "Bench Mob",
          abbreviation: "BEN",
        }
      : {
          id: "team-1",
          name: "Cap Casualties",
          abbreviation: "CAP",
        };

  return {
    id: input.id,
    teamId: team.id,
    seasonId: input.seasonId,
    playerId: input.player.id,
    rosterStatus: input.rosterStatus ?? "ACTIVE",
    hostPlatformReferenceId: input.hostPlatformReferenceId ?? null,
    effectiveAt: input.effectiveAt ?? new Date("2026-03-20T10:00:00.000Z"),
    team,
    player: input.player,
  };
}

function createRunHarness(options: RunHarnessOptions = {}) {
  const jobs: Array<Record<string, unknown>> = [];
  const transactionLogs: Array<Record<string, unknown>> = [];
  let mismatchCounter = 1;

  const players =
    options.players ??
    [
      createPlayer({
        id: "player-1",
        name: "Alpha QB",
        externalId: "player-1",
        sourceKey: "csv-manual",
        sourcePlayerId: "alpha-qb",
        nflTeam: "ATL",
        position: "QB",
      }),
      createPlayer({
        id: "player-2",
        name: "Bravo WR",
        externalId: "player-2",
        sourceKey: "csv-manual",
        sourcePlayerId: "bravo-wr",
        nflTeam: "BUF",
        position: "WR",
      }),
    ];

  const assignments =
    options.assignments ??
    [
      createAssignment({
        id: "assignment-1",
        teamId: "team-1",
        seasonId: "season-1",
        player: players[0]!,
        hostPlatformReferenceId: "host-assignment-1",
      }),
      createAssignment({
        id: "assignment-2",
        teamId: "team-1",
        seasonId: "season-1",
        player: players[1]!,
        hostPlatformReferenceId: "stale-host-ref",
      }),
    ];

  const approvedMappings = options.approvedMappings ?? [];
  const transactions = options.transactions ?? [];

  const mismatches: StoredMismatch[] = options.initialMismatches ?? [
    {
      id: "mismatch-stale",
      leagueId: "league-1",
      seasonId: "season-1",
      jobId: "job-old",
      teamId: "team-1",
      playerId: "player-2",
      rosterAssignmentId: "assignment-2",
      complianceIssueId: null,
      mismatchType: "ROSTER_MISSING_IN_HOST",
      severity: "HIGH_IMPACT",
      status: "OPEN",
      resolutionType: null,
      fingerprint: JSON.stringify({
        seasonId: "season-1",
        domain: "roster",
        playerKey: "player-2",
        teamKey: "team-1",
        rosterStatus: "ACTIVE",
        hostPlatformReferenceId: "stale-host-ref",
      }),
      title: "Stale mismatch",
      message: "Should be auto-resolved when not detected again.",
      hostPlatformReferenceId: "stale-host-ref",
      hostValueJson: null,
      dynastyValueJson: {
        rosterAssignmentId: "assignment-2",
      },
      metadataJson: {
        reason: "stale",
      },
      detectionCount: 2,
      firstDetectedAt: new Date("2026-03-20T10:00:00.000Z"),
      lastDetectedAt: new Date("2026-03-20T10:00:00.000Z"),
      resolvedAt: null,
      resolvedByUserId: null,
      resolutionReason: null,
      createdAt: new Date("2026-03-20T10:00:00.000Z"),
      updatedAt: new Date("2026-03-20T10:00:00.000Z"),
    },
  ];

  const client = {
    hostPlatformSyncJob: {
      async create(args: { data: Record<string, unknown> }) {
        const job = {
          id: "job-1",
          createdAt: new Date("2026-03-21T12:00:00.000Z"),
          updatedAt: new Date("2026-03-21T12:00:00.000Z"),
          requestedByUser: null,
          _count: {
            mismatches: 0,
          },
          ...args.data,
        };
        jobs.push(job);
        return job;
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const job = jobs.find((entry) => entry.id === args.where.id);
        if (job) {
          Object.assign(job, args.data);
        }
        return job;
      },
    },
    syncMismatch: {
      async create(args: { data: Record<string, unknown> }) {
        const mismatch = {
          id: `mismatch-${mismatchCounter++}`,
          teamId: null,
          playerId: null,
          rosterAssignmentId: null,
          complianceIssueId: null,
          status: "OPEN",
          resolutionType: null,
          hostPlatformReferenceId: null,
          hostValueJson: null,
          dynastyValueJson: null,
          metadataJson: null,
          detectionCount: 1,
          firstDetectedAt: new Date(),
          lastDetectedAt: new Date(),
          resolvedAt: null,
          resolvedByUserId: null,
          resolutionReason: null,
          createdAt: new Date("2026-03-21T12:00:00.000Z"),
          updatedAt: new Date("2026-03-21T12:00:00.000Z"),
          ...(args.data as Partial<StoredMismatch>),
        } as StoredMismatch;
        mismatches.push(mismatch);
        return mismatch;
      },
      async findFirst(args: {
        where?: { leagueId?: string; fingerprint?: string; status?: string };
      }) {
        return (
          mismatches.find(
            (mismatch) =>
              mismatch.leagueId === args.where?.leagueId &&
              mismatch.fingerprint === args.where?.fingerprint &&
              mismatch.status === args.where?.status,
          ) ?? null
        );
      },
      async findMany(args: {
        where?: {
          leagueId?: string;
          seasonId?: string;
          status?: { in?: string[] };
          mismatchType?: { in?: string[] };
        };
      }) {
        return mismatches.filter((mismatch) => {
          if (args.where?.leagueId && mismatch.leagueId !== args.where.leagueId) {
            return false;
          }
          if (args.where?.seasonId && mismatch.seasonId !== args.where.seasonId) {
            return false;
          }
          if (args.where?.status?.in && !args.where.status.in.includes(mismatch.status)) {
            return false;
          }
          if (
            args.where?.mismatchType?.in &&
            !args.where.mismatchType.in.includes(mismatch.mismatchType)
          ) {
            return false;
          }
          return true;
        });
      },
      async update(args: { where: { id: string }; data: Record<string, unknown> }) {
        const mismatch = mismatches.find((entry) => entry.id === args.where.id);
        if (!mismatch) {
          throw new Error("missing mismatch");
        }
        Object.assign(mismatch, args.data, {
          updatedAt: new Date("2026-03-21T12:05:00.000Z"),
        });
        return mismatch;
      },
    },
    team: {
      async findMany() {
        return [
          {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
          {
            id: "team-2",
            name: "Bench Mob",
            abbreviation: "BEN",
          },
        ];
      },
    },
    player: {
      async findMany() {
        return players;
      },
    },
    playerIdentityMapping: {
      async findMany() {
        return approvedMappings;
      },
    },
    rosterAssignment: {
      async findMany() {
        return assignments;
      },
    },
    transaction: {
      async findMany() {
        return transactions;
      },
      async create(args: { data: Record<string, unknown> }) {
        transactionLogs.push(args.data);
        return args.data;
      },
    },
  };

  return {
    client,
    jobs,
    mismatches,
    transactionLogs,
  };
}

test("sync run creates new mismatches and resolves stale open mismatches deterministically", async () => {
  const harness = createRunHarness();
  const service = createSyncRunService(harness.client as never);

  const result = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    requestedByUserId: "user-1",
    actor: {
      email: "commissioner@local.league",
      role: "COMMISSIONER",
      teamId: null,
    },
    body: {
      adapterKey: "csv-manual",
      sourceLabel: "Smoke roster snapshot",
      roster: {
        format: "csv",
        csv: [
          "playerExternalId,playerName,position,teamName,rosterStatus,hostPlatformReferenceId",
          "player-1,Alpha QB,QB,Bench Mob,ACTIVE,host-sync-1",
          "player-2,Bravo WR,WR,Cap Casualties,ACTIVE,stale-host-ref",
        ].join("\n"),
      },
    },
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.equal(result.job.status, "SUCCEEDED");
  assert.equal(result.summary.created, 1);
  assert.equal(result.summary.updated, 0);
  assert.equal(result.summary.resolved, 1);
  assert.equal(result.summary.totalDetected, 1);
  assert.equal(result.summary.totalOpen, 1);

  const createdMismatch = harness.mismatches.find(
    (mismatch) => mismatch.mismatchType === "ROSTER_TEAM_DIFFERENCE",
  );
  assert.ok(createdMismatch);
  assert.equal(createdMismatch?.status, "OPEN");
  assert.equal(createdMismatch?.severity, "HIGH_IMPACT");

  const resolvedMismatch = harness.mismatches.find((mismatch) => mismatch.id === "mismatch-stale");
  assert.equal(resolvedMismatch?.status, "RESOLVED");
  assert.equal(
    resolvedMismatch?.resolutionReason,
    "No longer detected by the latest sync run.",
  );

  assert.equal(
    harness.mismatches.some(
      (mismatch) => mismatch.mismatchType === "TRANSACTION_MISSING_IN_HOST",
    ),
    false,
  );

  assert.equal(harness.transactionLogs.length, 1);
  assert.match(
    String(harness.transactionLogs[0]?.summary ?? ""),
    /Ran host platform sync/,
  );
});

test("sync run resolves roster rows by provider-aware source identity before legacy external ids", async () => {
  const player = createPlayer({
    id: "player-source-1",
    name: "Provider QB",
    externalId: null,
    sourceKey: "sleeper",
    sourcePlayerId: "1001",
    nflTeam: "SEA",
    position: "QB",
  });
  const harness = createRunHarness({
    players: [player],
    assignments: [
      createAssignment({
        id: "assignment-source-1",
        teamId: "team-1",
        seasonId: "season-1",
        player,
      }),
    ],
    initialMismatches: [],
  });
  const service = createSyncRunService(harness.client as never);

  const result = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    body: {
      adapterKey: "csv-manual",
      roster: {
        format: "csv",
        csv: [
          "playerSourceKey,playerSourcePlayerId,playerName,position,teamName,rosterStatus",
          "sleeper,1001,Provider QB,QB,Bench Mob,ACTIVE",
        ].join("\n"),
      },
    },
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.equal(result.job.status, "SUCCEEDED");
  assert.equal(result.summary.created, 1);

  const mismatch = harness.mismatches.find(
    (entry) => entry.mismatchType === "ROSTER_TEAM_DIFFERENCE",
  );
  assert.equal(mismatch?.playerId, "player-source-1");
  assert.equal(mismatch?.metadataJson?.matchStrategy, "source_identity");
});

test("sync run leaves ambiguous roster matches unresolved instead of auto-merging by name", async () => {
  const playerA = createPlayer({
    id: "player-ambiguous-a",
    name: "Casey WR",
    sourceKey: "seed-a",
    sourcePlayerId: "casey-wr-a",
    nflTeam: "BUF",
    position: "WR",
  });
  const playerB = createPlayer({
    id: "player-ambiguous-b",
    name: "Casey WR",
    sourceKey: "seed-b",
    sourcePlayerId: "casey-wr-b",
    nflTeam: "KC",
    position: "WR",
  });
  const harness = createRunHarness({
    players: [playerA, playerB],
    assignments: [],
    initialMismatches: [],
  });
  const service = createSyncRunService(harness.client as never);

  const result = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    body: {
      adapterKey: "csv-manual",
      roster: {
        format: "csv",
        csv: [
          "playerName,position,teamName,rosterStatus",
          "Casey WR,WR,Cap Casualties,ACTIVE",
        ].join("\n"),
      },
    },
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.equal(result.job.status, "SUCCEEDED");
  assert.equal(result.summary.created, 1);

  const mismatch = harness.mismatches.find(
    (entry) => entry.mismatchType === "ROSTER_MISSING_IN_APP",
  );
  assert.equal(mismatch?.playerId, null);
  assert.equal(mismatch?.metadataJson?.reason, "player_ambiguous");
  assert.deepEqual(mismatch?.metadataJson?.candidatePlayerIds, [
    "player-ambiguous-a",
    "player-ambiguous-b",
  ]);
});

test("sync run refuses roster matches when source identity collides with a different legacy external id", async () => {
  const sourcePlayer = createPlayer({
    id: "player-source-primary",
    name: "Collision RB",
    externalId: "legacy-primary",
    sourceKey: "sleeper",
    sourcePlayerId: "2001",
    nflTeam: "DET",
    position: "RB",
  });
  const conflictingLegacyPlayer = createPlayer({
    id: "player-source-conflict",
    name: "Collision RB Old",
    externalId: "legacy-conflict",
    sourceKey: "csv-manual",
    sourcePlayerId: "collision-rb-old",
    nflTeam: "DET",
    position: "RB",
  });
  const harness = createRunHarness({
    players: [sourcePlayer, conflictingLegacyPlayer],
    assignments: [],
    initialMismatches: [],
  });
  const service = createSyncRunService(harness.client as never);

  const result = await service.run({
    leagueId: "league-1",
    seasonId: "season-1",
    body: {
      adapterKey: "csv-manual",
      roster: {
        format: "csv",
        csv: [
          "playerSourceKey,playerSourcePlayerId,playerExternalId,playerName,position,teamName,rosterStatus",
          "sleeper,2001,legacy-conflict,Collision RB,RB,Cap Casualties,ACTIVE",
        ].join("\n"),
      },
    },
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.equal(result.job.status, "SUCCEEDED");
  assert.equal(result.summary.created, 1);

  const mismatch = harness.mismatches.find(
    (entry) => entry.mismatchType === "ROSTER_MISSING_IN_APP",
  );
  assert.equal(mismatch?.playerId, null);
  assert.equal(mismatch?.metadataJson?.reason, "player_identity_conflict");
  assert.deepEqual(mismatch?.metadataJson?.conflictingPlayerIds, ["player-source-conflict"]);
});
