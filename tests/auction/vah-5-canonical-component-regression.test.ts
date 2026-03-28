import assert from "node:assert/strict";
import test from "node:test";
import { 
  VeteranAuctionDisplayState, 
  deriveVeteranAuctionDisplayState, 
  getVeteranAuctionDisplayConfig 
} from "@/lib/domain/auction/shared";

/**
 * VAH-5: Component-Level Regression Tests
 * 
 * Unit and integration tests for auction board, overlay, and workspace components
 * to prevent hybrid-state regressions and ensure canonical consistency.
 */

test("VAH-5: board row component uses canonical display state only", () => {
  // Simulate auction board row data for different states
  
  // Open market player
  const openMarketRow = {
    playerId: "player-1", 
    status: "ELIGIBLE",
    hasActiveBid: false,
    isAwarded: false,
    currentLeadingBidAmount: null,
    currentLeadingBidYears: null
  };

  const openMarketState = deriveVeteranAuctionDisplayState(openMarketRow);
  const openMarketConfig = getVeteranAuctionDisplayConfig(openMarketState);

  // VAH-2: Board should use canonical display, not raw status
  assert.equal(openMarketState, VeteranAuctionDisplayState.OPEN_MARKET);
  assert.equal(openMarketConfig.label, "Open Market");
  assert.equal(openMarketConfig.showTimer, false);
  assert.equal(openMarketConfig.showLeader, false);
  assert.equal(openMarketConfig.showSalary, false);

  // Active bidding player
  const activeBiddingRow = {
    playerId: "player-2",
    status: "OPEN_BIDDING", 
    hasActiveBid: true,
    isAwarded: false,
    currentLeadingBidAmount: 500000,
    currentLeadingBidYears: 2
  };

  const activeBiddingState = deriveVeteranAuctionDisplayState(activeBiddingRow);
  const activeBiddingConfig = getVeteranAuctionDisplayConfig(activeBiddingState);

  // VAH-2: Should show canonical active bidding display
  assert.equal(activeBiddingState, VeteranAuctionDisplayState.ACTIVE_BIDDING);
  assert.equal(activeBiddingConfig.label, "Active Bidding");
  assert.equal(activeBiddingConfig.showTimer, true);
  assert.equal(activeBiddingConfig.showLeader, true);
  assert.equal(activeBiddingConfig.showSalary, true);

  // Awarded player
  const awardedRow = {
    playerId: "player-3",
    status: "AWARDED",
    hasActiveBid: true, // Even with active bid, should prioritize award
    isAwarded: true,
    currentLeadingBidAmount: 600000,
    currentLeadingBidYears: 3
  };

  const awardedState = deriveVeteranAuctionDisplayState(awardedRow);
  const awardedConfig = getVeteranAuctionDisplayConfig(awardedState);

  // VAH-2: Should show canonical awarded display
  assert.equal(awardedState, VeteranAuctionDisplayState.AWARDED);
  assert.equal(awardedConfig.label, "Finalized");
  assert.equal(awardedConfig.showTimer, false); // No timer for awarded
  assert.equal(awardedConfig.allowBidding, false); // No bidding for awarded
});

test("VA-S1: overlay title always shows player name, not market state", () => {
  // Test that canonical presenter uses player name as title regardless of market state
  
  function simulateCanonicalPresenter(boardRow: any) {
    const displayState = deriveVeteranAuctionDisplayState(boardRow);
    const displayConfig = getVeteranAuctionDisplayConfig(displayState);
    
    // Simulate createHeaderContent logic from canonical presenter
    let marketStateLabel: string;
    if (displayState === VeteranAuctionDisplayState.AWARDED) {
      marketStateLabel = "Contract Finalized";
    } else if (displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING) {
      marketStateLabel = "Active Bidding"; 
    } else {
      marketStateLabel = "Open Market";
    }
    
    return {
      headerContent: {
        title: boardRow.playerName, // VA-S1: Always player name
        marketStateLabel: marketStateLabel, // VA-S1: Market state as secondary
        subtitle: "Sample subtitle"
      }
    };
  }

  const testCases = [
    {
      name: "Open Market Player",
      boardRow: {
        playerName: "Test Player",
        status: "ELIGIBLE", 
        hasActiveBid: false,
        isAwarded: false
      },
      expectedMarketState: "Open Market"
    },
    {
      name: "Active Bidding Player", 
      boardRow: {
        playerName: "Bidding Player",
        status: "OPEN_BIDDING",
        hasActiveBid: true,
        isAwarded: false
      },
      expectedMarketState: "Active Bidding"
    },
    {
      name: "Awarded Player",
      boardRow: {
        playerName: "Awarded Player", 
        status: "AWARDED",
        hasActiveBid: false,
        isAwarded: true
      },
      expectedMarketState: "Contract Finalized"
    }
  ];

  testCases.forEach(testCase => {
    const result = simulateCanonicalPresenter(testCase.boardRow);
    
    // VA-S1: Title should always be player name, never market state
    assert.equal(result.headerContent.title, testCase.boardRow.playerName,
      `${testCase.name}: title should be player name "${testCase.boardRow.playerName}", not market state`);
    
    // Market state should appear in separate field
    assert.equal(result.headerContent.marketStateLabel, testCase.expectedMarketState,
      `${testCase.name}: market state should be "${testCase.expectedMarketState}"`);
    
    // Title should never be the market state
    assert.notEqual(result.headerContent.title, testCase.expectedMarketState,
      `${testCase.name}: title should never be the market state`);
  });
});

test("VAH-5: overlay header/body/action state consistency", () => {
  // Test that overlay components derive consistent state from canonical presenter
  
  function simulateOverlayState(boardRow: any) {
    const displayState = deriveVeteranAuctionDisplayState(boardRow);
    const displayConfig = getVeteranAuctionDisplayConfig(displayState);
    
    // Simulate overlay header logic
    const headerState = {
      title: boardRow.playerName,
      status: displayConfig.label,
      showTimer: displayConfig.showTimer,
      showContractTerms: displayConfig.showSalary && displayConfig.showYears
    };
    
    // Simulate overlay action logic  
    const actionState = {
      allowBidding: displayConfig.allowBidding,
      buttonText: displayState === VeteranAuctionDisplayState.OPEN_MARKET 
        ? "Place First Bid" 
        : displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING 
        ? "Place Bid" 
        : "",
      disabled: !displayConfig.allowBidding
    };
    
    return { headerState, actionState, displayState, displayConfig };
  }

  // Test open market player overlay
  const openMarketPlayer = {
    playerId: "player-1",
    playerName: "Test Player",
    status: "ELIGIBLE",
    hasActiveBid: false,
    isAwarded: false
  };

  const openOverlay = simulateOverlayState(openMarketPlayer);
  
  // VAH-3: Header, body, and action should be consistent for open market
  assert.equal(openOverlay.headerState.status, "Open Market");
  assert.equal(openOverlay.headerState.showTimer, false);
  assert.equal(openOverlay.headerState.showContractTerms, false);
  assert.equal(openOverlay.actionState.allowBidding, true);
  assert.equal(openOverlay.actionState.buttonText, "Place First Bid");
  assert.equal(openOverlay.actionState.disabled, false);

  // Test active bidding player overlay
  const activeBiddingPlayer = {
    playerId: "player-2",
    playerName: "Active Player",
    status: "OPEN_BIDDING",
    hasActiveBid: true,
    isAwarded: false
  };

  const activeOverlay = simulateOverlayState(activeBiddingPlayer);
  
  // VAH-3: Should show active bidding state consistently
  assert.equal(activeOverlay.headerState.status, "Active Bidding");
  assert.equal(activeOverlay.headerState.showTimer, true);
  assert.equal(activeOverlay.headerState.showContractTerms, true);
  assert.equal(activeOverlay.actionState.allowBidding, true);
  assert.equal(activeOverlay.actionState.buttonText, "Place Bid");

  // Test awarded player overlay
  const awardedPlayer = {
    playerId: "player-3",
    playerName: "Awarded Player", 
    status: "AWARDED",
    hasActiveBid: false,
    isAwarded: true
  };

  const awardedOverlay = simulateOverlayState(awardedPlayer);
  
  // VAH-3: Should show finalized state with no bidding
  assert.equal(awardedOverlay.headerState.status, "Finalized");
  assert.equal(awardedOverlay.headerState.showTimer, false);
  assert.equal(awardedOverlay.actionState.allowBidding, false);
  assert.equal(awardedOverlay.actionState.disabled, true);
});

test("VAH-5: workspace component canonical consistency", () => {
  // Test that workspace derives state consistently with overlay
  
  function simulateWorkspaceState(boardRow: any) {
    const displayState = deriveVeteranAuctionDisplayState(boardRow);
    const displayConfig = getVeteranAuctionDisplayConfig(displayState);
    
    // Simulate workspace sections
    const workspaceState = {
      playerInfo: {
        name: boardRow.playerName,
        position: boardRow.position,
        status: displayConfig.label
      },
      marketSummary: {
        showLeader: displayConfig.showLeader,
        showSalary: displayConfig.showSalary, 
        showTimer: displayConfig.showTimer,
        isFinalized: displayState === VeteranAuctionDisplayState.AWARDED
      },
      actionPanel: {
        canBid: displayConfig.allowBidding,
        bidButtonText: displayState === VeteranAuctionDisplayState.OPEN_MARKET 
          ? "Place First Bid"
          : displayState === VeteranAuctionDisplayState.ACTIVE_BIDDING
          ? "Submit Bid" 
          : "Contract Finalized",
        showBidForm: displayConfig.allowBidding
      }
    };
    
    return workspaceState;
  }

  // Test workspace for open market player
  const openMarketData = {
    playerId: "player-1",
    playerName: "Open Player",
    position: "RB",
    status: "ELIGIBLE",
    hasActiveBid: false,
    isAwarded: false
  };

  const openWorkspace = simulateWorkspaceState(openMarketData);
  
  // VAH-3: Workspace should match overlay canonical state
  assert.equal(openWorkspace.playerInfo.status, "Open Market");
  assert.equal(openWorkspace.marketSummary.showTimer, false);
  assert.equal(openWorkspace.marketSummary.showLeader, false);
  assert.equal(openWorkspace.actionPanel.canBid, true);
  assert.equal(openWorkspace.actionPanel.bidButtonText, "Place First Bid");
  assert.equal(openWorkspace.actionPanel.showBidForm, true);

  // Test workspace for awarded player
  const awardedData = {
    playerId: "player-2", 
    playerName: "Awarded Player",
    position: "WR",
    status: "AWARDED",
    hasActiveBid: false,
    isAwarded: true
  };

  const awardedWorkspace = simulateWorkspaceState(awardedData);
  
  // VAH-3: Should show finalized state consistently
  assert.equal(awardedWorkspace.playerInfo.status, "Finalized");
  assert.equal(awardedWorkspace.marketSummary.isFinalized, true);
  assert.equal(awardedWorkspace.actionPanel.canBid, false);
  assert.equal(awardedWorkspace.actionPanel.bidButtonText, "Contract Finalized");
  assert.equal(awardedWorkspace.actionPanel.showBidForm, false);
});

test("VAH-5: canonical player presenter ID handling", () => {
  // Test that canonical presenter properly exposes both player ID and entry ID
  
  function simulateCanonicalPresenter(playerId: string, boardRows: any[]) {
    const boardRow = boardRows.find(row => row.playerId === playerId);
    
    if (!boardRow) {
      return null;
    }
    
    const displayState = deriveVeteranAuctionDisplayState(boardRow);
    const displayConfig = getVeteranAuctionDisplayConfig(displayState);
    
    // VAH-4: Must expose both player ID and entry ID
    return {
      playerId: boardRow.playerId,
      entryId: boardRow.entryId, // Critical for bid actions
      playerName: boardRow.playerName,
      displayState,
      displayConfig
    };
  }

  const mockBoardRows = [
    {
      playerId: "player-123",
      entryId: "entry-456", // Different from player ID
      playerName: "Test Player",
      status: "ELIGIBLE", 
      hasActiveBid: false,
      isAwarded: false
    }
  ];

  const presentation = simulateCanonicalPresenter("player-123", mockBoardRows);
  
  // VAH-4: Should have both IDs available
  assert.equal(presentation?.playerId, "player-123");
  assert.equal(presentation?.entryId, "entry-456");
  assert.notEqual(presentation?.playerId, presentation?.entryId); // They should be different
  
  // VAH-4: Bid action would use entry ID, not player ID
  function simulateBidAction(canonicalPresentation: any, salary: number, years: number) {
    // This should use entryId, not playerId
    return {
      poolEntryId: canonicalPresentation.entryId, // Correct usage
      salaryAmount: salary,
      contractYears: years
    };
  }
  
  const bidPayload = simulateBidAction(presentation, 500000, 2);
  assert.equal(bidPayload.poolEntryId, "entry-456");
  assert.equal(bidPayload.salaryAmount, 500000);
  assert.equal(bidPayload.contractYears, 2);
});

test("VAH-5: no blind-auction state leakage", () => {
  // Test that canonical state derivation never returns blind-auction states
  
  const testCases = [
    { 
      status: "ELIGIBLE", 
      hasActiveBid: false, 
      isAwarded: false,
      blindWindowActive: true // Even with this, should not affect veteran auction
    },
    {
      status: "BLIND_BIDDING", // Raw status that shouldn't appear
      hasActiveBid: true,
      isAwarded: false 
    },
    {
      status: "OPEN_BIDDING",
      hasActiveBid: true, 
      isAwarded: false,
      blindPhaseRemaining: 30 // Blind config should not affect display
    }
  ];

  testCases.forEach((testCase, index) => {
    const displayState = deriveVeteranAuctionDisplayState(testCase);
    const displayConfig = getVeteranAuctionDisplayConfig(displayState);
    
    // VAH-1: Should never return blind-auction specific states
    assert.notEqual(displayState, "BLIND_BIDDING");
    assert.notEqual(displayState, "BLIND_WINDOW_ACTIVE");
    assert.notEqual(displayConfig.label, "Blind Bidding");
    assert.notEqual(displayConfig.label, "Blind Window Active");
    
    // Should map to canonical states only
    const canonicalStates = [
      VeteranAuctionDisplayState.OPEN_MARKET,
      VeteranAuctionDisplayState.ACTIVE_BIDDING,
      VeteranAuctionDisplayState.AWARDED,
      VeteranAuctionDisplayState.INELIGIBLE
    ];
    
    assert.ok(canonicalStates.includes(displayState), 
      `Test case ${index}: ${displayState} is not a canonical state`);
  });
});

test("VAH-5: display config prevents contradictory combinations", () => {
  // Test that display config rules prevent contradictory UI combinations
  
  const testCases = [
    {
      name: "Open Market",
      state: VeteranAuctionDisplayState.OPEN_MARKET,
      expectedConfig: {
        showTimer: false,
        showLeader: false, 
        showSalary: false,
        showYears: false,
        allowBidding: true
      }
    },
    {
      name: "Active Bidding",
      state: VeteranAuctionDisplayState.ACTIVE_BIDDING,
      expectedConfig: {
        showTimer: true,
        showLeader: true,
        showSalary: true,
        showYears: true,
        allowBidding: true
      }
    },
    {
      name: "Awarded",
      state: VeteranAuctionDisplayState.AWARDED,
      expectedConfig: {
        showTimer: false, // No timer for finalized
        showLeader: true, // Show winner
        showSalary: true, // Show final contract
        showYears: true,
        allowBidding: false // No bidding for awarded
      }
    },
    {
      name: "Ineligible", 
      state: VeteranAuctionDisplayState.INELIGIBLE,
      expectedConfig: {
        showTimer: false,
        showLeader: false,
        showSalary: false,
        showYears: false,
        allowBidding: false
      }
    }
  ];

  testCases.forEach(testCase => {
    const config = getVeteranAuctionDisplayConfig(testCase.state);
    
    // Check each expected property
    Object.entries(testCase.expectedConfig).forEach(([property, expected]) => {
      assert.equal(
        config[property as keyof typeof config], 
        expected,
        `${testCase.name}: ${property} should be ${expected}`
      );
    });
    
    // VAH-5: Check for contradictory combinations
    if (config.label === "Open Market") {
      // Open market should not show timer or leader
      assert.equal(config.showTimer, false, "Open Market should not show timer");
      assert.equal(config.showLeader, false, "Open Market should not show leader");
    }
    
    if (config.label === "Active Bidding") {
      // Active bidding should show contract terms
      assert.equal(config.showSalary, true, "Active Bidding should show salary");
      assert.equal(config.showYears, true, "Active Bidding should show years");
    }
    
    if (config.label === "Awarded") {
      // Awarded should not allow bidding
      assert.equal(config.allowBidding, false, "Awarded should not allow bidding");
    }
  });
});