import assert from "node:assert/strict";
import test from "node:test";
import { createActivityFeedProjection } from "@/lib/read-models/activity/activity-feed-projection";

test("activity feed projection summarizes and paginates activity events", async () => {
  const projection = createActivityFeedProjection({
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
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    activityEvent: {
      async findMany() {
        return [
          {
            id: "event-1",
            eventType: "trade.proposal.accepted",
            title: "Trade proposal accepted",
            body: "Bench Mob accepted a trade from Cap Casualties.",
            payload: {
              proposalId: "proposal-1",
            },
            occurredAt: new Date("2026-03-22T16:00:00.000Z"),
            createdAt: new Date("2026-03-22T16:00:00.000Z"),
            actorUser: {
              id: "user-1",
              email: "owner@example.com",
              name: "Owner",
            },
            team: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
            relatedTeam: {
              id: "team-2",
              name: "Bench Mob",
              abbreviation: "BEN",
            },
            player: null,
            sourceEntityType: "TRADE_PROPOSAL",
            sourceEntityId: "proposal-1",
          },
          {
            id: "event-2",
            eventType: "auction.player_awarded",
            title: "Auction player awarded",
            body: "Player One was awarded to Bench Mob.",
            payload: {
              awardId: "award-1",
            },
            occurredAt: new Date("2026-03-21T16:00:00.000Z"),
            createdAt: new Date("2026-03-21T16:00:00.000Z"),
            actorUser: null,
            team: {
              id: "team-2",
              name: "Bench Mob",
              abbreviation: "BEN",
            },
            relatedTeam: null,
            player: {
              id: "player-1",
              name: "Player One",
              position: "WR",
              nflTeam: "BUF",
            },
            sourceEntityType: "AUCTION_AWARD",
            sourceEntityId: "award-1",
          },
        ];
      },
      async count() {
        return 2;
      },
      async groupBy() {
        return [
          {
            eventType: "trade.proposal.accepted",
            _count: {
              _all: 1,
            },
          },
          {
            eventType: "auction.player_awarded",
            _count: {
              _all: 1,
            },
          },
        ];
      },
    },
    season: {
      async findMany() {
        return [
          {
            id: "season-1",
            year: 2026,
            status: "ACTIVE",
            phase: "REGULAR_SEASON",
          },
        ];
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
  } as never);

  const result = await projection.read({
    leagueId: "league-1",
    seasonId: "season-1",
    limit: 1,
  });

  assert.ok(result);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.byFamily.trade, 1);
  assert.equal(result.summary.byFamily.auction, 1);
  assert.equal(result.feed.length, 1);
  assert.equal(result.feed[0]?.eventFamily, "trade");
  assert.equal(result.feed[0]?.context?.proposalId, "proposal-1");
  assert.equal(result.page.nextCursor, "event-2");
});

test("activity feed projection returns null when league context is missing", async () => {
  const projection = createActivityFeedProjection({
    league: {
      async findUnique() {
        return null;
      },
    },
  } as never);

  const result = await projection.read({
    leagueId: "league-missing",
  });

  assert.equal(result, null);
});
