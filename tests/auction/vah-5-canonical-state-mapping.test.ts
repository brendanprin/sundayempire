import assert from "node:assert/strict";
import test from "node:test";
import { 
  VeteranAuctionDisplayState, 
  deriveVeteranAuctionDisplayState, 
  getVeteranAuctionDisplayConfig 
} from "@/lib/domain/auction/shared";

/**
 * VAH-5: Unit Tests for Canonical Display State Mapping
 * 
 * Comprehensive unit test coverage for the canonical state derivation and display 
 * configuration logic to prevent regression to mixed legacy/canonical behavior.
 */

test("VAH-5: canonical state derivation prioritizes awarded status", () => {
  // VA-4: Awarded state should always take priority, regardless of other flags
  
  const testCases = [
    {
      name: "Explicit AWARDED status",
      input: { status: "AWARDED", hasActiveBid: false, isAwarded: true },
      expected: VeteranAuctionDisplayState.AWARDED
    },
    {
      name: "isAwarded flag with conflicting status", 
      input: { status: "OPEN_BIDDING", hasActiveBid: true, isAwarded: true },
      expected: VeteranAuctionDisplayState.AWARDED
    },
    {
      name: "isAwarded flag with eligible status",
      input: { status: "ELIGIBLE", hasActiveBid: false, isAwarded: true },
      expected: VeteranAuctionDisplayState.AWARDED
    },
    {
      name: "AWARDED status even without isAwarded flag",
      input: { status: "AWARDED", hasActiveBid: true, isAwarded: false },
      expected: VeteranAuctionDisplayState.AWARDED
    }
  ];

  testCases.forEach(testCase => {
    const result = deriveVeteranAuctionDisplayState(testCase.input);
    assert.equal(result, testCase.expected, 
      `${testCase.name}: Expected ${testCase.expected}, got ${result}`);
  });
});

test("VAH-5: open market state derivation rules", () => {
  // VA-1 + VA-5: Open market should be derived from eligible status with no active bid
  
  const testCases = [
    {
      name: "Basic eligible player",
      input: { status: "ELIGIBLE", hasActiveBid: false, isAwarded: false },
      expected: VeteranAuctionDisplayState.OPEN_MARKET
    },
    {
      name: "Eligible with null bid amount",
      input: { 
        status: "ELIGIBLE", 
        hasActiveBid: false, 
        isAwarded: false,
        currentLeadingBidAmount: null,
        currentLeadingBidYears: null
      },
      expected: VeteranAuctionDisplayState.OPEN_MARKET
    },
    {
      name: "Eligible with zero bid amount",
      input: { 
        status: "ELIGIBLE", 
        hasActiveBid: false, 
        isAwarded: false,
        currentLeadingBidAmount: 0
      },
      expected: VeteranAuctionDisplayState.OPEN_MARKET
    }
  ];

  testCases.forEach(testCase => {
    const result = deriveVeteranAuctionDisplayState(testCase.input);
    assert.equal(result, testCase.expected,
      `${testCase.name}: Expected ${testCase.expected}, got ${result}`);
  });
});

test("VAH-5: active bidding state derivation rules", () => {
  // VA-1: Active bidding requires open bidding status AND active bid
  
  const testCases = [
    {
      name: "Open bidding with active bid",
      input: { 
        status: "OPEN_BIDDING", 
        hasActiveBid: true, 
        isAwarded: false,
        currentLeadingBidAmount: 500000
      },
      expected: VeteranAuctionDisplayState.ACTIVE_BIDDING
    },
    {
      name: "Open bidding with bid amount and years",
      input: {
        status: "OPEN_BIDDING",
        hasActiveBid: true,
        isAwarded: false,
        currentLeadingBidAmount: 750000,
        currentLeadingBidYears: 2
      },
      expected: VeteranAuctionDisplayState.ACTIVE_BIDDING
    }
  ];

  testCases.forEach(testCase => {
    const result = deriveVeteranAuctionDisplayState(testCase.input);
    assert.equal(result, testCase.expected,
      `${testCase.name}: Expected ${testCase.expected}, got ${result}`);
  });
});

test("VAH-5: ineligible state derivation rules", () => {
  // VA-1: Ineligible state for restricted or invalid players
  
  const testCases = [
    {
      name: "Restricted player",
      input: { status: "RESTRICTED", hasActiveBid: false, isAwarded: false },
      expected: VeteranAuctionDisplayState.INELIGIBLE
    },
    {
      name: "Invalid status",
      input: { status: "INVALID", hasActiveBid: false, isAwarded: false },
      expected: VeteranAuctionDisplayState.INELIGIBLE
    },
    {
      name: "Null/undefined status",
      input: { status: null, hasActiveBid: false, isAwarded: false },
      expected: VeteranAuctionDisplayState.INELIGIBLE
    }
  ];

  testCases.forEach(testCase => {
    const result = deriveVeteranAuctionDisplayState(testCase.input);
    assert.equal(result, testCase.expected,
      `${testCase.name}: Expected ${testCase.expected}, got ${result}`);
  });
});

test("VAH-5: display configuration for open market state", () => {
  // VA-5: Open market should show no timer, no leader, no salary, but allow bidding
  
  const config = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.OPEN_MARKET);
  
  assert.equal(config.label, "Open Market");
  assert.equal(config.showTimer, false, "Open market should not show timer");
  assert.equal(config.showLeader, false, "Open market should not show leader");
  assert.equal(config.showSalary, false, "Open market should not show salary");
  assert.equal(config.showYears, false, "Open market should not show years");
  assert.equal(config.allowBidding, true, "Open market should allow bidding");
  assert.equal(config.showBidHistory, true, "Open market should show bid history");
});

test("VAH-5: display configuration for active bidding state", () => {
  // VA-5: Active bidding should show everything including timer
  
  const config = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.ACTIVE_BIDDING);
  
  assert.equal(config.label, "Active Bidding");
  assert.equal(config.showTimer, true, "Active bidding should show timer");
  assert.equal(config.showLeader, true, "Active bidding should show leader");
  assert.equal(config.showSalary, true, "Active bidding should show salary");
  assert.equal(config.showYears, true, "Active bidding should show years");
  assert.equal(config.allowBidding, true, "Active bidding should allow bidding");
  assert.equal(config.showBidHistory, true, "Active bidding should show bid history");
});

test("VAH-5: display configuration for awarded state", () => {
  // VA-4 + VA-5: Awarded should show final contract but no timer or bidding
  
  const config = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.AWARDED);
  
  assert.equal(config.label, "Awarded");
  assert.equal(config.showTimer, false, "Awarded should not show timer");
  assert.equal(config.showLeader, true, "Awarded should show winner");
  assert.equal(config.showSalary, true, "Awarded should show final salary");
  assert.equal(config.showYears, true, "Awarded should show final years");
  assert.equal(config.allowBidding, false, "Awarded should not allow bidding");
  assert.equal(config.showBidHistory, true, "Awarded should show bid history");
});

test("VAH-5: display configuration for ineligible state", () => {
  // VA-1: Ineligible should show minimal info and no bidding
  
  const config = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.INELIGIBLE);
  
  assert.equal(config.label, "Ineligible");
  assert.equal(config.showTimer, false, "Ineligible should not show timer");
  assert.equal(config.showLeader, false, "Ineligible should not show leader");
  assert.equal(config.showSalary, false, "Ineligible should not show salary");
  assert.equal(config.showYears, false, "Ineligible should not show years");
  assert.equal(config.allowBidding, false, "Ineligible should not allow bidding");
  assert.equal(config.showBidHistory, false, "Ineligible should not show bid history");
});

test("VAH-5: state transitions preserve consistency", () => {
  // Test state transitions maintain logical consistency
  
  // Open Market → Active Bidding (first bid)
  const openMarket = deriveVeteranAuctionDisplayState({
    status: "ELIGIBLE", 
    hasActiveBid: false, 
    isAwarded: false
  });
  
  const afterFirstBid = deriveVeteranAuctionDisplayState({
    status: "OPEN_BIDDING",
    hasActiveBid: true,
    isAwarded: false,
    currentLeadingBidAmount: 500000
  });
  
  assert.equal(openMarket, VeteranAuctionDisplayState.OPEN_MARKET);
  assert.equal(afterFirstBid, VeteranAuctionDisplayState.ACTIVE_BIDDING);
  
  // Active Bidding → Awarded (auction ends)
  const awarded = deriveVeteranAuctionDisplayState({
    status: "AWARDED",
    hasActiveBid: true,
    isAwarded: true,
    currentLeadingBidAmount: 500000
  });
  
  assert.equal(awarded, VeteranAuctionDisplayState.AWARDED);
  
  // Verify config changes make sense
  const openConfig = getVeteranAuctionDisplayConfig(openMarket);
  const activeConfig = getVeteranAuctionDisplayConfig(afterFirstBid);
  const awardedConfig = getVeteranAuctionDisplayConfig(awarded);
  
  // Timer should appear after first bid, disappear after award
  assert.equal(openConfig.showTimer, false);
  assert.equal(activeConfig.showTimer, true);
  assert.equal(awardedConfig.showTimer, false);
  
  // Bidding should be disabled after award
  assert.equal(openConfig.allowBidding, true);
  assert.equal(activeConfig.allowBidding, true);
  assert.equal(awardedConfig.allowBidding, false);
});

test("VAH-5: invalid inputs produce safe defaults", () => {
  // Test that invalid or malformed inputs don't break state derivation
  
  const invalidInputs = [
    null,
    undefined,
    {},
    { status: undefined },
    { hasActiveBid: null },
    { isAwarded: undefined },
    { status: "", hasActiveBid: "invalid", isAwarded: "not bool" }
  ];
  
  invalidInputs.forEach((input, index) => {
    const result = deriveVeteranAuctionDisplayState(input as any);
    
    // Should fall back to INELIGIBLE for safety
    assert.equal(result, VeteranAuctionDisplayState.INELIGIBLE,
      `Invalid input ${index} should default to INELIGIBLE, got ${result}`);
  });
});

test("VAH-5: no blind-auction states in canonical model", () => {
  // VAH-1: Ensure canonical model never returns blind-auction states
  
  const blindInputs = [
    { status: "BLIND_BIDDING", hasActiveBid: true, isAwarded: false },
    { status: "BLIND_WINDOW_ACTIVE", hasActiveBid: false, isAwarded: false },
    { 
      status: "OPEN_BIDDING", 
      hasActiveBid: true, 
      isAwarded: false,
      blindWindowActive: true,
      blindPhaseRemaining: 30
    }
  ];
  
  blindInputs.forEach((input, index) => {
    const result = deriveVeteranAuctionDisplayState(input as any);
    
    // Should never return blind-specific states  
    assert.notEqual(result, "BLIND_BIDDING");
    assert.notEqual(result, "BLIND_WINDOW_ACTIVE");
    
    // Should map to canonical veteran auction states
    const canonicalStates = [
      VeteranAuctionDisplayState.OPEN_MARKET,
      VeteranAuctionDisplayState.ACTIVE_BIDDING,
      VeteranAuctionDisplayState.AWARDED,
      VeteranAuctionDisplayState.INELIGIBLE
    ];
    
    assert.ok(canonicalStates.includes(result),
      `Blind input ${index} returned non-canonical state: ${result}`);
  });
});

test("VAH-5: canonical mapper handles edge cases", () => {
  // Test edge cases in state mapping logic
  
  const edgeCases = [
    {
      name: "OPEN_BIDDING without hasActiveBid flag",
      input: { status: "OPEN_BIDDING", hasActiveBid: false, isAwarded: false },
      expected: VeteranAuctionDisplayState.INELIGIBLE // Invalid state
    },
    {
      name: "ELIGIBLE with hasActiveBid true (inconsistent)",
      input: { status: "ELIGIBLE", hasActiveBid: true, isAwarded: false },
      expected: VeteranAuctionDisplayState.OPEN_MARKET // Status takes precedence
    },
    {
      name: "Multiple conflicting flags",
      input: { 
        status: "ELIGIBLE", 
        hasActiveBid: true, 
        isAwarded: true // Awarded should win
      },
      expected: VeteranAuctionDisplayState.AWARDED
    },
    {
      name: "Case sensitivity in status",
      input: { status: "eligible", hasActiveBid: false, isAwarded: false },
      expected: VeteranAuctionDisplayState.INELIGIBLE // Should be case sensitive
    }
  ];
  
  edgeCases.forEach(testCase => {
    const result = deriveVeteranAuctionDisplayState(testCase.input as any);
    assert.equal(result, testCase.expected,
      `${testCase.name}: Expected ${testCase.expected}, got ${result}`);
  });
});

test("VAH-5: display config immutability", () => {
  // Test that display configs are immutable and don't interfere with each other
  
  const openConfig1 = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.OPEN_MARKET);
  const openConfig2 = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.OPEN_MARKET);
  const activeConfig = getVeteranAuctionDisplayConfig(VeteranAuctionDisplayState.ACTIVE_BIDDING);
  
  // Should be equivalent but not the same object
  assert.deepEqual(openConfig1, openConfig2);
  
  // Modifying one shouldn't affect the other
  (openConfig1 as any).testProperty = "modified";
  assert.notEqual((openConfig2 as any).testProperty, "modified");
  
  // Different states should have different configs
  assert.notDeepEqual(openConfig1, activeConfig);
  assert.notEqual(openConfig1.showTimer, activeConfig.showTimer);
});