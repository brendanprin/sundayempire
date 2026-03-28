import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { ACTIVITY_EVENT_TYPES } from "@/lib/domain/activity/event-types";
import { createActivityEventRepository } from "@/lib/repositories/activity/activity-event-repository";

test("activity event repository create applies safe defaults", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createActivityEventRepository({
    activityEvent: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    leagueId: "league-1",
    seasonId: "season-1",
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalSubmitted,
    title: "Trade proposal submitted",
    body: "Cap Casualties sent a trade proposal to Bench Mob.",
    payload: null,
  });

  assert.deepEqual(capturedData, {
    leagueId: "league-1",
    seasonId: "season-1",
    actorUserId: null,
    teamId: null,
    relatedTeamId: null,
    playerId: null,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalSubmitted,
    title: "Trade proposal submitted",
    body: "Cap Casualties sent a trade proposal to Bench Mob.",
    sourceEntityType: null,
    sourceEntityId: null,
    dedupeKey: null,
    payload: Prisma.DbNull,
    occurredAt: capturedData?.occurredAt,
  });

  assert.ok(capturedData?.occurredAt instanceof Date);
});

test("activity event repository create preserves typed payloads", async () => {
  let capturedData: Record<string, unknown> | null = null;

  const repository = createActivityEventRepository({
    activityEvent: {
      async create(args: { data: Record<string, unknown> }) {
        capturedData = args.data;
        return args.data;
      },
    },
  } as never);

  await repository.create({
    leagueId: "league-1",
    seasonId: "season-1",
    teamId: "team-1",
    relatedTeamId: "team-2",
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalAccepted,
    title: "Trade accepted",
    body: "Bench Mob accepted a trade proposal from Cap Casualties.",
    sourceEntityType: "TRADE_PROPOSAL",
    sourceEntityId: "proposal-1",
    dedupeKey: "trade.proposal.accepted:proposal-1",
    payload: {
      proposalId: "proposal-1",
      proposerTeamId: "team-1",
      proposerTeamName: "Cap Casualties",
      counterpartyTeamId: "team-2",
      counterpartyTeamName: "Bench Mob",
    },
  });

  assert.deepEqual(capturedData, {
    leagueId: "league-1",
    seasonId: "season-1",
    actorUserId: null,
    teamId: "team-1",
    relatedTeamId: "team-2",
    playerId: null,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalAccepted,
    title: "Trade accepted",
    body: "Bench Mob accepted a trade proposal from Cap Casualties.",
    sourceEntityType: "TRADE_PROPOSAL",
    sourceEntityId: "proposal-1",
    dedupeKey: "trade.proposal.accepted:proposal-1",
    payload: {
      proposalId: "proposal-1",
      proposerTeamId: "team-1",
      proposerTeamName: "Cap Casualties",
      counterpartyTeamId: "team-2",
      counterpartyTeamName: "Bench Mob",
    },
    occurredAt: capturedData?.occurredAt,
  });
});
