import assert from "node:assert/strict";
import test from "node:test";
import {
  formatAuctionPlayerAwardedActivity,
  formatCommissionerRulingPublishedActivity,
  formatLifecyclePhaseTransitionActivity,
  formatRookieDraftPickSelectedActivity,
  formatTradeProposalSubmittedActivity,
} from "@/lib/domain/activity/formatters";
import { ACTIVITY_EVENT_TYPES } from "@/lib/domain/activity/event-types";

test("lifecycle formatter produces human-readable manager-facing copy", () => {
  const event = formatLifecyclePhaseTransitionActivity({
    transitionId: "transition-1",
    fromPhase: "ROOKIE_DRAFT",
    toPhase: "REGULAR_SEASON",
  });

  assert.equal(event.eventType, ACTIVITY_EVENT_TYPES.lifecycle.phaseTransitioned);
  assert.equal(event.title, "League moved to Regular Season");
  assert.equal(event.body, "Rookie Draft ended and Regular Season is now active.");
});

test("commissioner ruling formatter does not leak internal rationale", () => {
  const event = formatCommissionerRulingPublishedActivity({
    overrideId: "override-1",
    overrideType: "LINEUP_EXCEPTION",
    entityType: "COMPLIANCE_ISSUE",
    entityId: "issue-1",
    team: {
      id: "team-1",
      name: "Cap Casualties",
    },
    internalReason: "Owner admitted they never set a lineup for three weeks.",
  });

  assert.equal(event.eventType, ACTIVITY_EVENT_TYPES.commissioner.rulingPublished);
  assert.match(event.body, /Cap Casualties/);
  assert.doesNotMatch(event.body, /three weeks|never set a lineup|admitted/i);
  assert.doesNotMatch(event.title, /three weeks|never set a lineup|admitted/i);
});

test("trade and draft formatters carry scoped ids and readable summaries", () => {
  const tradeEvent = formatTradeProposalSubmittedActivity({
    proposalId: "proposal-1",
    proposerTeam: {
      id: "team-1",
      name: "Cap Casualties",
    },
    counterpartyTeam: {
      id: "team-2",
      name: "Bench Mob",
    },
  });

  assert.equal(tradeEvent.eventType, ACTIVITY_EVENT_TYPES.trade.proposalSubmitted);
  assert.equal(tradeEvent.teamId, "team-1");
  assert.equal(tradeEvent.relatedTeamId, "team-2");
  assert.match(tradeEvent.body, /Cap Casualties sent a trade proposal to Bench Mob/);

  const draftEvent = formatRookieDraftPickSelectedActivity({
    draftId: "draft-1",
    draftPickId: "pick-1",
    selectionId: "selection-1",
    round: 1,
    pickNumber: 3,
    team: {
      id: "team-2",
      name: "Bench Mob",
    },
    player: {
      id: "player-1",
      name: "Alpha QB",
    },
  });

  assert.equal(draftEvent.eventType, ACTIVITY_EVENT_TYPES.draft.rookiePickSelected);
  assert.equal(draftEvent.teamId, "team-2");
  assert.equal(draftEvent.playerId, "player-1");
  assert.match(draftEvent.body, /Bench Mob selected Alpha QB at pick 1.03/);
});

test("auction formatter stays human-readable and compact", () => {
  const event = formatAuctionPlayerAwardedActivity({
    draftId: "draft-1",
    awardId: "award-1",
    team: {
      id: "team-1",
      name: "Cap Casualties",
    },
    player: {
      id: "player-1",
      name: "Alpha QB",
    },
    salaryAmount: 12,
    contractYears: 2,
  });

  assert.equal(event.eventType, ACTIVITY_EVENT_TYPES.auction.playerAwarded);
  assert.match(event.body, /\$12/);
  assert.match(event.body, /2-year deal/);
});
