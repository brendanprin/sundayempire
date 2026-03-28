import assert from "node:assert/strict";
import test from "node:test";
import { 
  VeteranAuctionDisplayState, 
  deriveVeteranAuctionDisplayState, 
  getVeteranAuctionDisplayConfig 
} from "@/lib/domain/auction/shared";

/**
 * VA-6: Integration tests for canonical state model and display logic
 * 
 * Tests the core business logic implemented in VA-1 through VA-5:
 * - State derivation rules (VA-1)
 * - Display configuration consistency (VA-1, VA-5) 
 * - Award vs active bid prioritization (VA-4)
 */

test("VA-6: canonical state derivation prioritizes awarded state", () => {
  // VA-4: Awarded state should take priority over any active bid state
  const awardedState = deriveVeteranAuctionDisplayState({
    status: "AWARDED",
    hasActiveBid: true,
    isAwarded: true,
  });
  
  assert.equal(awardedState, VeteranAuctionDisplayState.AWARDED);
  
  // Even if status is not AWARDED, isAwarded flag should trigger AWARDED state 
  const implicitAwardedState = deriveVeteranAuctionDisplayState({
    status: "OPEN_BIDDING",
    hasActiveBid: true,
    isAwarded: true,
  });
  
  assert.equal(implicitAwardedState, VeteranAuctionDisplayState.AWARDED);
});

test("VA-6: open market state shows no timer or leader information", () => {
  // VA-1 + VA-5: Open market players should not show timers or leader data
  const openMarketState = deriveVeteranAuctionDisplayState({
    status: "ELIGIBLE",
    hasActiveBid: false,
    isAwarded: false,
  });
  
  assert.equal(openMarketState, VeteranAuctionDisplayState.OPEN_MARKET);
  
  // Check display configuration rules
  const config = getVeteranAuctionDisplayConfig(openMarketState);
  assert.equal(config.showTimer, false);
  assert.equal(config.showLeader, false);
  assert.equal(config.showSalary, false);
  assert.equal(config.showYears, false);
  assert.equal(config.allowBidding, true);
  assert.equal(config.label, "Open Market");
});

test("VA-6: active bidding state shows all auction details", () => {
  // VA-1 + VA-5: Active bidding should show timer, leader, salary, years
  const activeBiddingState = deriveVeteranAuctionDisplayState({
    status: "OPEN_BIDDING",
    hasActiveBid: true,
    isAwarded: false,
  });
  
  assert.equal(activeBiddingState, VeteranAuctionDisplayState.ACTIVE_BIDDING);
  
  // Check display configuration rules
  const config = getVeteranAuctionDisplayConfig(activeBiddingState);
  assert.equal(config.showTimer, true);
  assert.equal(config.showLeader, true);
  assert.equal(config.showSalary, true);  
  assert.equal(config.showYears, true);
  assert.equal(config.allowBidding, true);
  assert.equal(config.label, "Active Bidding");
});

test("VA-6: awarded state shows finalized info but no timer or bidding", () => {
  // VA-4 + VA-5: Awarded players show contract details but no timer or bidding
  const awardedState = deriveVeteranAuctionDisplayState({
    status: "AWARDED",
    hasActiveBid: false,
    isAwarded: true,
  });
  
  assert.equal(awardedState, VeteranAuctionDisplayState.AWARDED);
  
  // Check display configuration rules (VA-4 enhancements)
  const config = getVeteranAuctionDisplayConfig(awardedState);
  assert.equal(config.showTimer, false); // No timer for finalized state
  assert.equal(config.showLeader, true); // Show winner
  assert.equal(config.showSalary, true); // Show contract terms
  assert.equal(config.showYears, true); // Show contract terms
  assert.equal(config.allowBidding, false); // No bidding allowed
  assert.equal(config.label, "Finalized"); // Enhanced label from VA-4
});

test("VA-6: expired and withdrawn states map to ineligible", () => {
  // VA-1: Non-awarded resolved states should be ineligible
  const expiredState = deriveVeteranAuctionDisplayState({
    status: "EXPIRED",
    hasActiveBid: false,
    isAwarded: false,
  });
  
  assert.equal(expiredState, VeteranAuctionDisplayState.INELIGIBLE);
  
  const withdrawnState = deriveVeteranAuctionDisplayState({
    status: "WITHDRAWN", 
    hasActiveBid: false,
    isAwarded: false,
  });
  
  assert.equal(withdrawnState, VeteranAuctionDisplayState.INELIGIBLE);
  
  // Check configuration for ineligible state
  const config = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.INELIGIBLE);
  assert.equal(config.showTimer, false);
  assert.equal(config.showLeader, false);
  assert.equal(config.showSalary, false);
  assert.equal(config.showYears, false);
  assert.equal(config.allowBidding, false);
  assert.equal(config.label, "Ineligible");
});

test("VA-6: eligible status requires active bid to show as active bidding", () => {
  // VA-1: ELIGIBLE status alone should map to OPEN_MARKET, not ACTIVE_BIDDING
  const eligibleWithoutBid = deriveVeteranAuctionDisplayState({
    status: "ELIGIBLE",
    hasActiveBid: false,
    isAwarded: false,
  });
  
  assert.equal(eligibleWithoutBid, VeteranAuctionDisplayState.OPEN_MARKET);
  
  // Only with active bid should it become ACTIVE_BIDDING
  const eligibleWithBid = deriveVeteranAuctionDisplayState({
    status: "ELIGIBLE",
    hasActiveBid: true,
    isAwarded: false,
  });
  
  assert.equal(eligibleWithBid, VeteranAuctionDisplayState.ACTIVE_BIDDING);
});

test("VA-6: state consistency prevents contradictory combinations", () => {
  // VA-5: Ensure no "Open market" with timer or "Bidding" without contract terms
  
  // Get all possible states and their configurations
  const states = [
    VeteranAuctionDisplayState.OPEN_MARKET,
    VeteranAuctionDisplayState.ACTIVE_BIDDING,
    VeteranAuctionDisplayState.AWARDED,
    VeteranAuctionDisplayState.INELIGIBLE,
  ];
  
  for (const state of states) {
    const config = getVeteranAuctionDisplayConfig(state);
    
    // Rule: Only ACTIVE_BIDDING should show timer
    if (state === VeteranAuctionDisplayState.ACTIVE_BIDDING) {
      assert.equal(config.showTimer, true, `${state} should show timer`);
    } else {
      assert.equal(config.showTimer, false, `${state} should NOT show timer`);
    }
    
    // Rule: Only ACTIVE_BIDDING and AWARDED should show leader/salary/years
    if (state === VeteranAuctionDisplayState.ACTIVE_BIDDING || state === VeteranAuctionDisplayState.AWARDED) {
      assert.equal(config.showLeader, true, `${state} should show leader`);
      assert.equal(config.showSalary, true, `${state} should show salary`);
      assert.equal(config.showYears, true, `${state} should show years`);
    } else {
      assert.equal(config.showLeader, false, `${state} should NOT show leader`);
      assert.equal(config.showSalary, false, `${state} should NOT show salary`);
      assert.equal(config.showYears, false, `${state} should NOT show years`);
    }
    
    // Rule: Only OPEN_MARKET and ACTIVE_BIDDING should allow bidding
    if (state === VeteranAuctionDisplayState.OPEN_MARKET || state === VeteranAuctionDisplayState.ACTIVE_BIDDING) {
      assert.equal(config.allowBidding, true, `${state} should allow bidding`);
    } else {
      assert.equal(config.allowBidding, false, `${state} should NOT allow bidding`);
    }
  }
});

console.log("✅ VA-6 Integration tests verify:");
console.log("  ✅ Canonical state derivation rules (VA-1)");  
console.log("  ✅ Awarded state prioritization (VA-4)");
console.log("  ✅ Timer visibility rules (VA-5)");
console.log("  ✅ Display configuration consistency");
console.log("  ✅ No contradictory state combinations");