import assert from "node:assert/strict";
import test from "node:test";
import { 
  VeteranAuctionDisplayState,
  deriveVeteranAuctionDisplayState,
  getVeteranAuctionDisplayConfig
} from "@/lib/domain/auction/shared";
import { createCanonicalPlayerPresentation } from "@/lib/ui/canonical-player-presenter";

/**
 * VA-S8: Open Market Presentation Rules Regression Tests
 * 
 * These tests lock down critical presentation rules to prevent regressions
 * related to open market display, overlay titles, and state consistency.
 */

test("VA-S8: player name overlay title behavior", () => {
  // Test that overlay title always uses player name, never market state or status
  
  function createMockRoom(boardRows: any[]) {
    return {
      boardRows,
      entries: boardRows.map(row => ({ player: { id: row.playerId, name: row.playerName } })),
      permissions: { canBid: true },
      viewer: { teamId: "my-team-id" }
    } as any;
  }

  function createMockBoardRow(overrides: any = {}) {
    return {
      playerId: "player-1",
      playerName: "Ja'Marr Chase", 
      position: "WR",
      nflTeam: "CIN",
      entryId: "entry-1",
      status: "ELIGIBLE",
      displayState: VeteranAuctionDisplayState.OPEN_MARKET,
      displayConfig: getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.OPEN_MARKET),
      currentLeaderTeamName: null,
      currentLeaderTeamId: null,
      leadingSalary: null,
      leadingYears: null,
      leadingTotalValue: null,
      timeLeftSeconds: null,
      isMyLeader: false,
      isMyBidding: false,
      isAwarded: false,
      hasAward: false,
      awardedTeamName: null,
      awardedTeamId: null,
      awardedSalary: null,
      awardedYears: null,
      ...overrides
    };
  }
  
  const permissions = { canBid: true, canSubmitBlindBid: false, canReviewBlindTies: false };
  
  // Test open market player
  const openMarketRow = createMockBoardRow({
    playerName: "Open Market Player",
    displayState: VeteranAuctionDisplayState.OPEN_MARKET
  });
  const openRoom = createMockRoom([openMarketRow]);
  const openPresentation = createCanonicalPlayerPresentation("player-1", openRoom, permissions);
  
  // VA-S8: Overlay title must be player name, not status
  assert.equal(openPresentation?.headerContent.title, "Open Market Player");
  assert.notEqual(openPresentation?.headerContent.title, "Open Market");
  assert.notEqual(openPresentation?.headerContent.title, "ELIGIBLE");
  
  // Test active bidding player  
  const activeBiddingRow = createMockBoardRow({
    playerName: "Active Bidding Player",
    displayState: VeteranAuctionDisplayState.ACTIVE_BIDDING,
    currentLeaderTeamName: "Other Team",
    leadingSalary: 500000
  });
  const activeRoom = createMockRoom([activeBiddingRow]);
  const activePresentation = createCanonicalPlayerPresentation("player-1", activeRoom, permissions);
  
  // VA-S8: Overlay title must be player name, not market state
  assert.equal(activePresentation?.headerContent.title, "Active Bidding Player");
  assert.notEqual(activePresentation?.headerContent.title, "Active Bidding");
  assert.notEqual(activePresentation?.headerContent.title, "Other Team leads");
  
  // Test awarded player
  const awardedRow = createMockBoardRow({
    playerName: "Awarded Player",
    displayState: VeteranAuctionDisplayState.AWARDED,
    isAwarded: true,
    awardedTeamName: "Winner Team"
  });
  const awardedRoom = createMockRoom([awardedRow]);
  const awardedPresentation = createCanonicalPlayerPresentation("player-1", awardedRoom, permissions);
  
  // VA-S8: Even for awarded players, title is player name
  assert.equal(awardedPresentation?.headerContent.title, "Awarded Player");
  assert.notEqual(awardedPresentation?.headerContent.title, "Contract Finalized");
  assert.notEqual(awardedPresentation?.headerContent.title, "Winner Team");
});

test("VA-S8: no salary/years/value for open-market rows", () => {
  // Test that open market players never show leading bid info
  
  function createMockBoardRow(displayState: VeteranAuctionDisplayState, overrides: any = {}) {
    const displayConfig = getVeteranAuctionDisplayConfig(displayState);
    return {
      playerId: "player-1",
      playerName: "Test Player",
      position: "RB",
      nflTeam: "DAL",
      entryId: "entry-1",
      status: "ELIGIBLE",
      displayState,
      displayConfig,
      currentLeaderTeamName: null,
      currentLeaderTeamId: null,
      leadingSalary: null,
      leadingYears: null, 
      leadingTotalValue: null,
      timeLeftSeconds: null,
      isMyLeader: false,
      isMyBidding: false,
      isAwarded: false,
      hasAward: false,
      awardedTeamName: null,
      awardedTeamId: null,
      awardedSalary: null,
      awardedYears: null,
      ...overrides
    };
  }
  
  function createMockRoom(boardRow: any) {
    return {
      boardRows: [boardRow],
      entries: [{ player: { id: boardRow.playerId, name: boardRow.playerName } }],
      permissions: { canBid: true },
      viewer: { teamId: "my-team-id" }
    } as any;
  }
  
  const permissions = { canBid: true, canSubmitBlindBid: false, canReviewBlindTies: false };
  
  // Test open market player - should never show salary/years/value
  const openMarketRow = createMockBoardRow(VeteranAuctionDisplayState.OPEN_MARKET);
  const openRoom = createMockRoom(openMarketRow);
  const openPresentation = createCanonicalPlayerPresentation("player-1", openRoom, permissions);
  
  // VA-S8: Open market should never show leading bid info
  assert.equal(openPresentation?.displayConfig.showSalary, false);
  assert.equal(openPresentation?.displayConfig.showYears, false);
  assert.equal(openPresentation?.displayConfig.showLeader, false);
  assert.equal(openPresentation?.marketSummary.leadingInfo.hasLeader, false);
  assert.equal(openPresentation?.marketSummary.leadingInfo.teamName, null);
  assert.equal(openPresentation?.marketSummary.leadingInfo.bidAmount, null);
  assert.equal(openPresentation?.marketSummary.leadingInfo.bidYears, null);
  assert.equal(openPresentation?.marketSummary.leadingInfo.totalValue, null);
  
  // Test active bidding player - should show salary/years/value
  const activeBiddingRow = createMockBoardRow(VeteranAuctionDisplayState.ACTIVE_BIDDING, {
    currentLeaderTeamName: "Leading Team",
    currentLeaderTeamId: "team-1", 
    leadingSalary: 750000,
    leadingYears: 3,
    leadingTotalValue: 2250000
  });
  const activeRoom = createMockRoom(activeBiddingRow);
  const activePresentation = createCanonicalPlayerPresentation("player-1", activeRoom, permissions);
  
  // VA-S8: Active bidding should show leading bid info
  assert.equal(activePresentation?.displayConfig.showSalary, true);
  assert.equal(activePresentation?.displayConfig.showYears, true);
  assert.equal(activePresentation?.displayConfig.showLeader, true);
  assert.equal(activePresentation?.marketSummary.leadingInfo.hasLeader, true);
  assert.equal(activePresentation?.marketSummary.leadingInfo.teamName, "Leading Team");
  assert.equal(activePresentation?.marketSummary.leadingInfo.bidAmount, 750000);
  assert.equal(activePresentation?.marketSummary.leadingInfo.bidYears, 3);
  assert.equal(activePresentation?.marketSummary.leadingInfo.totalValue, 2250000);
  
  // Test awarded player - should show final contract info 
  const awardedRow = createMockBoardRow(VeteranAuctionDisplayState.AWARDED, {
    isAwarded: true,
    hasAward: true,
    awardedTeamName: "Winner Team",
    awardedTeamId: "team-2",
    awardedSalary: 850000,
    awardedYears: 4
  });
  const awardedRoom = createMockRoom(awardedRow);
  const awardedPresentation = createCanonicalPlayerPresentation("player-1", awardedRoom, permissions);
  
  // VA-S8: Awarded should show final contract terms
  assert.equal(awardedPresentation?.displayConfig.showSalary, true);
  assert.equal(awardedPresentation?.displayConfig.showYears, true);
  assert.equal(awardedPresentation?.displayConfig.showLeader, true);
  assert.equal(awardedPresentation?.marketSummary.awardInfo.isAwarded, true);
  assert.equal(awardedPresentation?.marketSummary.awardInfo.winnerTeamName, "Winner Team");
  assert.equal(awardedPresentation?.marketSummary.awardInfo.finalSalary, 850000);
  assert.equal(awardedPresentation?.marketSummary.awardInfo.finalYears, 4);
});

test("VA-S8: canonical owner-facing state mapping for legacy blind/raw status", () => {
  // Test that various raw database states map correctly to canonical display states
  
  // Test BLIND_BIDDING maps to OPEN_MARKET for owner-facing display
  const blindBiddingState = deriveVeteranAuctionDisplayState({
    status: "BLIND_BIDDING" as any, // Legacy status
    hasActiveBid: false,
    isAwarded: false
  });
  assert.equal(blindBiddingState, VeteranAuctionDisplayState.OPEN_MARKET);
  
  // Test ELIGIBLE maps to OPEN_MARKET
  const eligibleState = deriveVeteranAuctionDisplayState({
    status: "ELIGIBLE",
    hasActiveBid: false,
    isAwarded: false
  });
  assert.equal(eligibleState, VeteranAuctionDisplayState.OPEN_MARKET);
  
  // Test OPEN_BIDDING with no active bid maps to OPEN_MARKET
  const openBiddingNoActiveState = deriveVeteranAuctionDisplayState({
    status: "OPEN_BIDDING",
    hasActiveBid: false,
    isAwarded: false
  });
  assert.equal(openBiddingNoActiveState, VeteranAuctionDisplayState.OPEN_MARKET);
  
  // Test OPEN_BIDDING with active bid maps to ACTIVE_BIDDING
  const openBiddingActiveState = deriveVeteranAuctionDisplayState({
    status: "OPEN_BIDDING",
    hasActiveBid: true,
    isAwarded: false
  });
  assert.equal(openBiddingActiveState, VeteranAuctionDisplayState.ACTIVE_BIDDING);
  
  // Test BLIND_BIDDING with active bid maps to ACTIVE_BIDDING (for edge case)
  const blindActiveState = deriveVeteranAuctionDisplayState({
    status: "BLIND_BIDDING" as any,
    hasActiveBid: true,
    isAwarded: false
  });
  assert.equal(blindActiveState, VeteranAuctionDisplayState.ACTIVE_BIDDING);
  
  // Test AWARDED always maps to AWARDED 
  const awardedState = deriveVeteranAuctionDisplayState({
    status: "AWARDED",
    hasActiveBid: false,
    isAwarded: true
  });
  assert.equal(awardedState, VeteranAuctionDisplayState.AWARDED);
  
  // Test EXPIRED maps to INELIGIBLE
  const expiredState = deriveVeteranAuctionDisplayState({
    status: "EXPIRED",
    hasActiveBid: false,
    isAwarded: false
  });
  assert.equal(expiredState, VeteranAuctionDisplayState.INELIGIBLE);
  
  // Test WITHDRAWN maps to INELIGIBLE
  const withdrawnState = deriveVeteranAuctionDisplayState({
    status: "WITHDRAWN",
    hasActiveBid: false,
    isAwarded: false
  });
  assert.equal(withdrawnState, VeteranAuctionDisplayState.INELIGIBLE);
  
  // Test unknown status maps to INELIGIBLE
  const unknownState = deriveVeteranAuctionDisplayState({
    status: "UNKNOWN_STATUS" as any,
    hasActiveBid: false,
    isAwarded: false
  });
  assert.equal(unknownState, VeteranAuctionDisplayState.INELIGIBLE);
});

test("VA-S8: no contradictory 'Leading' display on open-market rows", () => {
  // Test that open market players never show leading/bidding involvement states
  
  function createMockBoardRow(overrides: any = {}) {
    return {
      playerId: "player-1",
      playerName: "Test Player",
      position: "TE",
      nflTeam: "KC",
      entryId: "entry-1", 
      status: "ELIGIBLE",
      displayState: VeteranAuctionDisplayState.OPEN_MARKET,
      displayConfig: getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.OPEN_MARKET),
      currentLeaderTeamName: null,
      currentLeaderTeamId: null,
      leadingSalary: null,
      leadingYears: null,
      leadingTotalValue: null,
      timeLeftSeconds: null,
      isMyLeader: false,
      isMyBidding: false,
      isAwarded: false,
      hasAward: false,
      awardedTeamName: null,
      awardedTeamId: null,
      awardedSalary: null,
      awardedYears: null,
      ...overrides
    };
  }
  
  function createMockRoom(boardRow: any) {
    return {
      boardRows: [boardRow],
      entries: [{ player: { id: boardRow.playerId, name: boardRow.playerName } }],
      permissions: { canBid: true },
      viewer: { teamId: "my-team-id" }
    } as any;
  }
  
  const permissions = { canBid: true, canSubmitBlindBid: false, canReviewBlindTies: false };
  
  // Test open market player should never show leading state
  const openMarketRow = createMockBoardRow();
  const openRoom = createMockRoom(openMarketRow);
  const openPresentation = createCanonicalPlayerPresentation("player-1", openRoom, permissions);
  
  // VA-S8: Open market should never show leading info
  assert.equal(openPresentation?.marketSummary.leadingInfo.hasLeader, false);
  assert.equal(openPresentation?.marketSummary.leadingInfo.isViewerLeading, false); 
  assert.equal(openPresentation?.marketSummary.leadingInfo.teamName, null);
  assert.equal(openPresentation?.headerContent.marketStateLabel, "Open Market");
  assert.notEqual(openPresentation?.headerContent.marketStateLabel, "You're Leading");
  assert.notEqual(openPresentation?.headerContent.marketStateLabel, "Active Bidding");
  
  // Test open market with phantom leading data should still not show leading  
  const openMarketWithPhantomData = createMockBoardRow({
    // These should be ignored for open market state
    currentLeaderTeamName: "Phantom Team",
    currentLeaderTeamId: "my-team-id", // Even if it's "me"
    leadingSalary: 500000,
    leadingYears: 2,
    leadingTotalValue: 1000000,
    isMyLeader: true // This should be false for open market
  });
  const phantomRoom = createMockRoom(openMarketWithPhantomData);
  const phantomPresentation = createCanonicalPlayerPresentation("player-1", phantomRoom, permissions);
  
  // VA-S8: Even with phantom data, open market rules should prevail
  assert.equal(phantomPresentation?.marketSummary.leadingInfo.hasLeader, false);
  assert.equal(phantomPresentation?.marketSummary.leadingInfo.isViewerLeading, false);
  assert.equal(phantomPresentation?.headerContent.marketStateLabel, "Open Market");
  assert.equal(phantomPresentation?.headerContent.subtitle, "No bids yet • Be the first to bid");
  
  // Verify active bidding does show leading correctly for contrast
  const activeBiddingRow = createMockBoardRow({
    displayState: VeteranAuctionDisplayState.ACTIVE_BIDDING,
    displayConfig: getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.ACTIVE_BIDDING),
    currentLeaderTeamName: "Leading Team",
    currentLeaderTeamId: "my-team-id",
    leadingSalary: 600000,
    leadingYears: 3,
    leadingTotalValue: 1800000,
    isMyLeader: true
  });
  const activeRoom = createMockRoom(activeBiddingRow);
  const activePresentation = createCanonicalPlayerPresentation("player-1", activeRoom, permissions);
  
  // VA-S8: Active bidding should show leading state correctly
  assert.equal(activePresentation?.marketSummary.leadingInfo.hasLeader, true);
  assert.equal(activePresentation?.marketSummary.leadingInfo.isViewerLeading, true);
  assert.equal(activePresentation?.headerContent.marketStateLabel, "You're Leading");
  assert.equal(activePresentation?.marketSummary.leadingInfo.teamName, "Leading Team");
  
  // Test ineligible should not show leading either
  const ineligibleRow = createMockBoardRow({
    status: "EXPIRED",
    displayState: VeteranAuctionDisplayState.INELIGIBLE,
    displayConfig: getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.INELIGIBLE)
  });
  const ineligibleRoom = createMockRoom(ineligibleRow);
  const ineligiblePresentation = createCanonicalPlayerPresentation("player-1", ineligibleRoom, permissions);
  
  // VA-S8: Ineligible should not show leading
  assert.equal(ineligiblePresentation?.marketSummary.leadingInfo.hasLeader, false);
  assert.equal(ineligiblePresentation?.marketSummary.leadingInfo.isViewerLeading, false);
  assert.equal(ineligiblePresentation?.headerContent.marketStateLabel, "Not Available");
});