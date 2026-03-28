import assert from "node:assert/strict";
import test from "node:test";
import {
  readAdminLeagueCommissionerIntegrityIndex,
  readLeagueCommissionerGovernanceSnapshot,
} from "@/lib/read-models/commissioner-governance/commissioner-governance-read-model";

const NOW = new Date("2026-03-28T14:00:00.000Z");

test("commissioner governance snapshot serializes integrity and history rows", async () => {
  const client = {
    leagueMembership: {
      async findMany(args: {
        where: {
          leagueId: string;
          role?: "COMMISSIONER" | "MEMBER";
        };
      }) {
        const memberships = [
          {
            id: "membership-1",
            userId: "user-1",
            role: "COMMISSIONER",
            teamId: null,
            createdAt: NOW,
            user: {
              email: "commissioner@example.test",
              name: "League Commissioner",
            },
            team: null,
          },
          {
            id: "membership-2",
            userId: "user-2",
            role: "MEMBER",
            teamId: "team-1",
            createdAt: new Date("2026-03-28T15:00:00.000Z"),
            user: {
              email: "member@example.test",
              name: "League Member",
            },
            team: {
              name: "Cap Casualties",
            },
          },
        ];

        return args.where.role
          ? memberships.filter((membership) => membership.role === args.where.role)
          : memberships;
      },
    },
    transaction: {
      async findMany() {
        return [
          {
            id: "tx-1",
            summary: "Repaired commissioner integrity and assigned commissioner authority.",
            createdAt: new Date("2026-03-28T16:00:00.000Z"),
            metadata: {
              repair: {
                repairedBy: {
                  email: "platform-admin@example.test",
                  leagueRole: null,
                },
                targetEmail: "member@example.test",
              },
            },
          },
          {
            id: "tx-2",
            summary: "Transferred commissioner authority to member@example.test.",
            createdAt: new Date("2026-03-28T15:30:00.000Z"),
            metadata: {
              transfer: {
                fromEmail: "commissioner@example.test",
                toEmail: "member@example.test",
              },
            },
          },
          {
            id: "tx-3",
            summary: "Applied commissioner override.",
            createdAt: new Date("2026-03-28T15:00:00.000Z"),
            metadata: {
              actor: {
                email: "commissioner@example.test",
                leagueRole: "COMMISSIONER",
              },
            },
          },
          {
            id: "tx-4",
            summary: "Applied commissioner override with empty metadata.",
            createdAt: new Date("2026-03-28T14:30:00.000Z"),
            metadata: null,
          },
        ];
      },
    },
  };

  const snapshot = await readLeagueCommissionerGovernanceSnapshot(client as never, {
    leagueId: "league-1",
    includePendingCommissionerDesignation: false,
    historyLimit: 10,
  });

  assert.equal(snapshot.integrity.status, "HEALTHY");
  assert.equal(snapshot.integrity.activeCommissionerCount, 1);
  assert.equal(snapshot.commissioner?.email, "commissioner@example.test");
  assert.equal(snapshot.members.length, 2);
  assert.equal(snapshot.members[1]?.teamName, "Cap Casualties");
  assert.equal(snapshot.history.length, 4);
  assert.deepEqual(
    snapshot.history.map((entry) => entry.kind),
    ["COMMISSIONER_REPAIR", "COMMISSIONER_TRANSFER", "COMMISSIONER_OVERRIDE", "COMMISSIONER_OVERRIDE"],
  );
  assert.equal(snapshot.history[0]?.actor?.email, "platform-admin@example.test");
  assert.equal(snapshot.history[0]?.targetEmail, "member@example.test");
  assert.equal(snapshot.history[1]?.actor?.email, "commissioner@example.test");
  assert.equal(snapshot.history[3]?.actor, null);
});

test("admin commissioner integrity index supports search/filter/pagination", async () => {
  const leagues = [
    {
      id: "league-healthy",
      name: "Healthy League",
      createdAt: new Date("2026-03-27T12:00:00.000Z"),
      _count: {
        memberships: 12,
      },
    },
    {
      id: "league-missing",
      name: "Missing Commissioner League",
      createdAt: new Date("2026-03-28T12:00:00.000Z"),
      _count: {
        memberships: 10,
      },
    },
    {
      id: "league-conflict",
      name: "Conflict League",
      createdAt: new Date("2026-03-26T12:00:00.000Z"),
      _count: {
        memberships: 11,
      },
    },
  ];

  const client = {
    league: {
      async count(args: {
        where?: {
          name?: {
            contains?: string;
          };
        };
      }) {
        const search = args.where?.name?.contains?.toLowerCase() ?? "";
        return leagues.filter((leagueName) => leagueName.name.toLowerCase().includes(search)).length;
      },
      async findMany(args: {
        where?: {
          name?: {
            contains?: string;
          };
        };
        orderBy?: {
          createdAt?: "asc" | "desc";
        };
        skip?: number;
        take?: number;
      }) {
        const search = args.where?.name?.contains?.toLowerCase() ?? "";
        const direction = args.orderBy?.createdAt ?? "desc";
        const sortedRows = leagues
          .filter((row) => row.name.toLowerCase().includes(search))
          .sort((left, right) =>
            direction === "asc"
              ? left.createdAt.getTime() - right.createdAt.getTime()
              : right.createdAt.getTime() - left.createdAt.getTime(),
          );
        return sortedRows.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? 1000));
      },
    },
    leagueMembership: {
      async groupBy(args: {
        where: {
          leagueId: {
            in: string[];
          };
        };
      }) {
        const allowedLeagueIds = new Set(args.where.leagueId.in);
        return [
          {
            leagueId: "league-healthy",
            _count: {
              _all: 1,
            },
          },
          {
            leagueId: "league-conflict",
            _count: {
              _all: 2,
            },
          },
        ].filter((row) => allowedLeagueIds.has(row.leagueId));
      },
    },
  };

  const healthyPage = await readAdminLeagueCommissionerIntegrityIndex(client as never, {
    searchQuery: "league",
    integrityFilter: "HEALTHY",
    sort: "INTEGRITY_SEVERITY_DESC",
    page: 1,
    pageSize: 5,
  });

  assert.equal(healthyPage.totalCount, 1);
  assert.equal(healthyPage.rows.length, 1);
  assert.equal(healthyPage.sort, "INTEGRITY_SEVERITY_DESC");
  assert.equal(healthyPage.rows[0]?.leagueId, "league-healthy");
  assert.equal(healthyPage.rows[0]?.integrityStatus, "HEALTHY");

  const unhealthyPageOne = await readAdminLeagueCommissionerIntegrityIndex(client as never, {
    integrityFilter: "UNHEALTHY",
    sort: "INTEGRITY_SEVERITY_DESC",
    page: 1,
    pageSize: 1,
  });

  assert.equal(unhealthyPageOne.totalCount, 2);
  assert.equal(unhealthyPageOne.rows.length, 1);
  assert.equal(unhealthyPageOne.hasNextPage, true);
  assert.equal(unhealthyPageOne.hasPreviousPage, false);

  const unhealthyPageTwo = await readAdminLeagueCommissionerIntegrityIndex(client as never, {
    integrityFilter: "UNHEALTHY",
    sort: "INTEGRITY_SEVERITY_DESC",
    page: 2,
    pageSize: 1,
  });

  assert.equal(unhealthyPageTwo.totalCount, 2);
  assert.equal(unhealthyPageTwo.rows.length, 1);
  assert.equal(unhealthyPageTwo.hasNextPage, false);
  assert.equal(unhealthyPageTwo.hasPreviousPage, true);
  assert.notEqual(unhealthyPageTwo.rows[0]?.leagueId, unhealthyPageOne.rows[0]?.leagueId);

  const missing = [unhealthyPageOne.rows[0], unhealthyPageTwo.rows[0]].find(
    (row) => row?.leagueId === "league-missing",
  );
  const conflict = [unhealthyPageOne.rows[0], unhealthyPageTwo.rows[0]].find(
    (row) => row?.leagueId === "league-conflict",
  );

  assert.equal(missing?.integrityStatus, "MISSING_COMMISSIONER");
  assert.equal(missing?.activeCommissionerCount, 0);
  assert.equal(conflict?.integrityStatus, "MULTIPLE_COMMISSIONERS");
  assert.equal(conflict?.activeCommissionerCount, 2);

  const createdOldestFirst = await readAdminLeagueCommissionerIntegrityIndex(client as never, {
    sort: "CREATED_AT_ASC",
    page: 1,
    pageSize: 2,
  });

  assert.equal(createdOldestFirst.sort, "CREATED_AT_ASC");
  assert.deepEqual(
    createdOldestFirst.rows.map((row) => row.leagueId),
    ["league-conflict", "league-healthy"],
  );

  const normalizedPageSize = await readAdminLeagueCommissionerIntegrityIndex(client as never, {
    pageSize: 999,
  });
  assert.equal(normalizedPageSize.pageSize, 100);
});
