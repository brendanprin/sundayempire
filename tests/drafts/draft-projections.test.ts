import assert from "node:assert/strict";
import test from "node:test";
import { createDraftsHomeProjection } from "@/lib/read-models/draft/drafts-home-projection";
import { createDraftSetupProjection } from "@/lib/read-models/draft/draft-setup-projection";
import { createRookieDraftRoomProjection } from "@/lib/read-models/draft/rookie-draft-room-projection";

test("drafts home projection returns active rookie draft and owned picks summary", async () => {
  const projection = createDraftsHomeProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: null,
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "ROOKIE_DRAFT",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          leagueId: "league-1",
          seasonId: "season-1",
          type: "ROOKIE",
          status: "NOT_STARTED",
          title: "2026 Rookie Draft",
          currentPickIndex: 0,
          startedAt: null,
          completedAt: null,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          _count: {
            draftPicks: 24,
            picks: 0,
          },
          draftPicks: [],
          picks: [],
        };
      },
    },
    draftOrderEntry: {
      async count() {
        return 1;
      },
    },
    season: {
      async findUnique() {
        return {
          id: "season-1",
          leagueId: "league-1",
          year: 2026,
        };
      },
    },
    team: {
      async findUnique() {
        return {
          id: "team-1",
          leagueId: "league-1",
          name: "Cap Casualties",
          abbreviation: "CAP",
        };
      },
    },
    futurePick: {
      async findMany() {
        return [
          {
            id: "pick-1",
            seasonYear: 2026,
            round: 1,
            overall: 1,
            originalTeam: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
          },
          {
            id: "pick-2",
            seasonYear: 2027,
            round: 2,
            overall: 14,
            originalTeam: {
              id: "team-2",
              name: "Bench Mob",
              abbreviation: "BEN",
            },
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    actor: {
      leagueRole: "MEMBER",
      teamId: "team-1",
    },
    now: new Date("2026-03-02T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.activeRookieDraft?.progress.totalPicks, 24);
  assert.equal(result.myRookiePicks?.teamName, "Cap Casualties");
  assert.equal(result.myRookiePicks?.seasons.length, 2);
  assert.equal(result.setupStatus.warningCount, 1);
  assert.equal(result.permissions.canManageRookieDraft, false);
});

test("draft setup projection stays empty-state safe before a rookie draft exists", async () => {
  const projection = createDraftSetupProjection({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: null,
          seasons: [
            {
              id: "season-1",
              year: 2027,
              status: "ACTIVE",
              phase: "ROOKIE_DRAFT",
              openedAt: new Date("2027-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    team: {
      async findMany() {
        return [
          { id: "team-1", name: "Cap Casualties", abbreviation: "CAP" },
          { id: "team-2", name: "Bench Mob", abbreviation: "BEN" },
        ];
      },
    },
    draft: {
      async findFirst() {
        return null;
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    actorRole: "COMMISSIONER",
    now: new Date("2027-03-01T00:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.defaultTitle, "2027 Rookie Draft");
  assert.equal(result.draft, null);
  assert.equal(result.status.needsDraftCreation, true);
  assert.equal(result.entries.length, 0);
  assert.equal(result.teams.length, 2);
  assert.equal(result.permissions.canManage, true);
});

test("rookie draft room projection returns current pick, filtered players, and member permissions", async () => {
  const projection = createRookieDraftRoomProjection({
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          leagueId: "league-1",
          seasonId: "season-1",
          type: "ROOKIE",
          status: "IN_PROGRESS",
          title: "2026 Rookie Draft",
          currentPickIndex: 0,
          startedAt: new Date("2026-03-10T00:00:00.000Z"),
          completedAt: null,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-10T00:00:00.000Z"),
          _count: {
            draftPicks: 2,
            picks: 0,
          },
          draftPicks: [],
          picks: [],
          league: {
            id: "league-1",
            name: "Dynasty League",
          },
        };
      },
    },
    draftPick: {
      async findMany() {
        return [
          {
            id: "draft-pick-1",
            pickNumber: 1,
            round: 1,
            status: "PENDING",
            selectingTeamId: "team-1",
            selectingTeam: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
            orderEntry: {
              owningTeam: {
                id: "team-1",
                name: "Cap Casualties",
                abbreviation: "CAP",
              },
              originalTeam: {
                id: "team-1",
                name: "Cap Casualties",
                abbreviation: "CAP",
              },
            },
            futurePick: {
              id: "pick-1",
              seasonYear: 2026,
              round: 1,
              overall: 1,
              isUsed: false,
            },
            selection: null,
          },
          {
            id: "draft-pick-2",
            pickNumber: 2,
            round: 1,
            status: "SELECTED",
            selectingTeamId: "team-2",
            selectingTeam: {
              id: "team-2",
              name: "Bench Mob",
              abbreviation: "BEN",
            },
            orderEntry: {
              owningTeam: {
                id: "team-2",
                name: "Bench Mob",
                abbreviation: "BEN",
              },
              originalTeam: {
                id: "team-2",
                name: "Bench Mob",
                abbreviation: "BEN",
              },
            },
            futurePick: {
              id: "pick-2",
              seasonYear: 2026,
              round: 1,
              overall: null,
              isUsed: true,
            },
            selection: {
              id: "selection-2",
              outcome: "SELECTED",
              playerId: "player-2",
              salary: 5,
              contractYears: 2,
              madeAt: new Date("2026-03-10T12:00:00.000Z"),
              player: {
                id: "player-2",
                name: "Bravo RB",
                position: "RB",
              },
            },
          },
        ];
      },
    },
    draftSelection: {
      async findMany() {
        return [];
      },
    },
    player: {
      async findMany() {
        return [
          {
            id: "player-1",
            sourceKey: "mock-rookie-class-2026",
            sourcePlayerId: "2026-001-fernando-mendoza-qb",
            externalId: "2026-001-fernando-mendoza-qb",
            name: "Fernando Mendoza",
            position: "QB",
            nflTeam: "LV",
            age: 21,
            yearsPro: 0,
            injuryStatus: null,
            isRestricted: false,
            rosterSlots: [],
            contracts: [],
          },
          {
            id: "player-2",
            name: "Ja'Marr Chase",
            position: "WR",
            nflTeam: "CIN",
            age: 26,
            yearsPro: 5,
            injuryStatus: null,
            isRestricted: false,
            rosterSlots: [],
            contracts: [],
          },
        ];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    seasonYear: 2026,
    draftId: "draft-1",
    actor: {
      leagueRole: "MEMBER",
      teamId: "team-1",
    },
    now: new Date("2026-03-10T13:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result.currentPick?.pickNumber, 1);
  assert.equal(result.currentPick?.salaryPreview, 5);
  assert.equal(result.availablePlayers.length, 1);
  assert.equal(result.availablePlayers[0]?.name, "Fernando Mendoza");
  assert.equal(result.availablePlayers[0]?.draftRank, 1);
  assert.equal(result.availablePlayers[0]?.draftTier, 1);
  assert.equal(result.permissions.canSelect, true);
  assert.equal(result.permissions.canForfeit, false);
  assert.equal(result.warnings.length, 1);
});
