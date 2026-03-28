import assert from "node:assert/strict";
import test from "node:test";
import { createAuctionRoomProjection } from "@/lib/read-models/auction/auction-room-projection";
import { createAuctionSetupProjection } from "@/lib/read-models/auction/auction-setup-projection";

test("auction setup projection stays empty-state safe and still exposes emergency candidates before draft creation", async () => {
  const projection = createAuctionSetupProjection({
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
              phase: "REGULAR_SEASON",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
              closedAt: null,
            },
          ],
        };
      },
    },
    team: {
      async findMany() {
        return [{ id: "team-1", name: "Cap Casualties", abbreviation: "CAP" }];
      },
    },
    draft: {
      async findFirst() {
        return null;
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
            name: "Ja'Marr Chase",
            displayName: "Ja'Marr Chase",
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
    auctionAward: {
      async findMany() {
        return [];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    actorRole: "COMMISSIONER",
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result?.draft, null);
  assert.equal(result?.status.needsDraftCreation, true);
  assert.equal(result?.status.reviewState, "NOT_GENERATED");
  assert.equal(result?.status.includedCount, 1);
  assert.equal(result?.status.excludedCount, 0);
  assert.equal(result?.emergencyCandidates.length, 1);
  assert.equal(result?.emergencyCandidates[0]?.name, "Ja'Marr Chase");
});

test("auction setup projection returns existing pool state and blind-window warning", async () => {
  const projection = createAuctionSetupProjection({
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
              phase: "REGULAR_SEASON",
              openedAt: new Date("2026-01-01T00:00:00.000Z"),
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
        return {
          id: "draft-1",
          leagueId: "league-1",
          seasonId: "season-1",
          type: "VETERAN_AUCTION",
          status: "NOT_STARTED",
          title: "2026 Veteran Auction",
          currentPickIndex: 0,
          auctionMode: "STANDARD",
          auctionPoolReviewStatus: "FINALIZED",
          auctionEndsAt: new Date("2026-03-22T00:00:00.000Z"),
          auctionOpenBidWindowSeconds: 60,
          auctionBidResetSeconds: 30,
          startedAt: new Date("2026-03-20T00:00:00.000Z"),
          completedAt: null,
          createdAt: new Date("2026-03-01T00:00:00.000Z"),
          updatedAt: new Date("2026-03-21T11:00:00.000Z"),
        };
      },
    },
    auctionPlayerPoolEntry: {
      async findMany() {
        return [
          {
            id: "entry-1",
            status: "OPEN_BIDDING",
            currentLeadingBidAmount: 11,
            player: {
              id: "player-1",
              name: "Alpha Veteran",
              position: "WR",
              nflTeam: "FA",
            },
            nominatedByTeam: null,
            currentLeadingTeam: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
          },
        ];
      },
      async count() {
        return 1;
      },
    },
    auctionPlayerPoolExclusion: {
      async findMany() {
        return [
          {
            id: "exclusion-1",
            reason: "RESTRICTED",
            reasonDetailsJson: ["RESTRICTED"],
            player: {
              id: "player-x",
              name: "Restricted Veteran",
              position: "WR",
              nflTeam: "FA",
              isRestricted: true,
              rosterSlots: [],
              contracts: [],
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
            id: "player-2",
            name: "Bijan Robinson",
            displayName: "Bijan Robinson",
            position: "RB",
            nflTeam: "ATL",
            age: 24,
            yearsPro: 3,
            injuryStatus: null,
            isRestricted: false,
            rosterSlots: [],
            contracts: [],
          },
        ];
      },
    },
    auctionBid: {
      async count() {
        return 0;
      },
    },
    auctionAward: {
      async count() {
        return 0;
      },
      async findMany() {
        return [];
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    actorRole: "COMMISSIONER",
    now: new Date("2026-03-21T12:00:00.000Z"),
  });

  assert.ok(result);
  assert.equal(result?.draft?.title, "2026 Veteran Auction");
  assert.equal(result?.status.poolEntryCount, 1);
  assert.equal(result?.status.includedCount, 1);
  assert.equal(result?.status.excludedCount, 1);
  assert.equal(result?.status.reviewState, "FINALIZED");
  assert.equal(result?.status.readyForStart, true);
  assert.equal(result?.status.canRegenerate, false);
  // VA-S9: STANDARD auctions don't have blind windows, even during final 24h
  assert.equal(result?.status.blindWindowActive, false);
  // VA-S9: No blind window warnings for owner-facing STANDARD auctions
  assert.equal(result?.warnings.length, 0);
  assert.equal(result?.excludedPlayers.length, 1);
  assert.equal(result?.emergencyCandidates.length, 1);
});

test("auction room projection marks tied blind bids for commissioner review", async () => {
  const projection = createAuctionRoomProjection({
    draft: {
      async findFirst() {
        return {
          id: "draft-1",
          leagueId: "league-1",
          seasonId: "season-1",
          type: "VETERAN_AUCTION",
          status: "IN_PROGRESS",
          title: "2026 Veteran Auction",
          currentPickIndex: 0,
          auctionMode: "EMERGENCY_FILL_IN",
          auctionEndsAt: new Date("2026-03-22T11:00:00.000Z"), // Tomorrow at 11:00
          auctionOpenBidWindowSeconds: 60,
          auctionBidResetSeconds: 30,
          startedAt: new Date("2026-03-21T09:00:00.000Z"),
          completedAt: null,
          createdAt: new Date("2026-03-21T08:00:00.000Z"),
          updatedAt: new Date("2026-03-21T11:05:00.000Z"),
          league: {
            id: "league-1",
            name: "Dynasty League",
          },
        };
      },
    },
    auctionPlayerPoolEntry: {
      async findMany() {
        return [
          {
            id: "entry-1",
            status: "BLIND_BIDDING",
            currentLeadingBidAmount: 7,
            openBidClosesAt: null,
            blindBidClosesAt: new Date("2026-03-21T11:00:00.000Z"),
            createdAt: new Date("2026-03-21T09:00:00.000Z"),
            updatedAt: new Date("2026-03-21T11:01:00.000Z"),
            player: {
              id: "player-1",
              name: "Alpha Veteran",
              position: "WR",
              nflTeam: "FA",
              age: 26,
              isRestricted: false,
            },
            currentLeadingTeam: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
            bids: [
              {
                id: "bid-1",
                biddingTeamId: "team-1",
                bidType: "BLIND",
                salaryAmount: 7,
                contractYears: 1,
                status: "ACTIVE",
                submittedAt: new Date("2026-03-21T10:10:00.000Z"),
                biddingTeam: {
                  id: "team-1",
                  name: "Cap Casualties",
                  abbreviation: "CAP",
                },
              },
              {
                id: "bid-2",
                biddingTeamId: "team-2",
                bidType: "BLIND",
                salaryAmount: 7,
                contractYears: 1,
                status: "ACTIVE",
                submittedAt: new Date("2026-03-21T10:11:00.000Z"),
                biddingTeam: {
                  id: "team-2",
                  name: "Bench Mob",
                  abbreviation: "BEN",
                },
              },
            ],
            award: null,
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
      role: "COMMISSIONER",
      teamId: null,
    },
    now: new Date("2026-03-21T12:00:00.000Z"), // 23 hours before end - clearly in blind window
  });

  assert.ok(result);
  // VA-S9: EMERGENCY_FILL_IN auctions still support blind windows for commissioner control
  assert.equal(result?.config.blindWindowActive, true);
  assert.equal(result?.entries.length, 1);
  assert.equal(result?.entries[0]?.review.required, true);
  assert.equal(result?.entries[0]?.review.tiedBlindBids.length, 2);
  assert.equal(result?.permissions.canReviewBlindTies, true);
});
