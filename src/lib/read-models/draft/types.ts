import {
  AuctionPoolExclusionReason,
  AuctionPoolReviewStatus,
  AuctionPlayerPoolEntryStatus,
  AuctionSessionMode,
  DraftOrderSourceType,
  DraftPickStatus,
  DraftSelectionOutcome,
} from "@prisma/client";
import { DraftSessionSummary } from "@/types/draft";

export type DraftHomeProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  activeRookieDraft: DraftSessionSummary | null;
  activeVeteranAuction: {
    draft: DraftSessionSummary;
    mode: AuctionSessionMode | null;
    auctionEndsAt: string | null;
    poolEntryCount: number;
    resolvedEntryCount: number;
    blindWindowActive: boolean;
    warningCount: number;
  } | null;
  myRookiePicks: {
    available: boolean;
    teamId: string | null;
    teamName: string | null;
    seasons: {
      seasonYear: number;
      totalCount: number;
      rounds: {
        round: number;
        picks: {
          id: string;
          overall: number | null;
          originalTeamName: string;
        }[];
      }[];
    }[];
  } | null;
  setupStatus: {
    available: boolean;
    needsDraftCreation: boolean;
    needsBoardGeneration: boolean;
    totalBoardPicks: number;
    warningCount: number;
    warnings: {
      code: string;
      message: string;
    }[];
  };
  veteranAuctionStatus: {
    available: boolean;
    needsDraftCreation: boolean;
    needsPoolGeneration: boolean;
    totalPoolEntries: number;
    warningCount: number;
    warnings: {
      code: string;
      message: string;
    }[];
  };
  links: {
    rookie: string;
    veteranAuction: string;
  };
  permissions: {
    canManageRookieDraft: boolean;
    canManageVeteranAuction: boolean;
  };
  generatedAt: string;
};

export type DraftSetupProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  defaultTitle: string;
  draft: DraftSessionSummary | null;
  status: {
    needsDraftCreation: boolean;
    needsBoardGeneration: boolean;
    estimatedOrderUsed: boolean;
    warningCount: number;
  };
  warnings: {
    code: string;
    message: string;
  }[];
  entries: {
    id: string;
    pickNumber: number;
    round: number;
    sourceType: DraftOrderSourceType;
    isBonus: boolean;
    isManualOverride: boolean;
    overrideReason: string | null;
    futurePick: {
      id: string;
      seasonYear: number;
      round: number;
      overall: number | null;
    } | null;
    originalTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
    owningTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    selectingTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    draftPick: {
      id: string;
      status: DraftPickStatus;
    } | null;
  }[];
  teams: {
    id: string;
    name: string;
    abbreviation: string | null;
  }[];
  permissions: {
    canManage: boolean;
    canCorrectOrder: boolean;
  };
  generatedAt: string;
};

export type RookieDraftRoomProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  draft: DraftSessionSummary;
  board: {
    id: string;
    pickNumber: number;
    round: number;
    status: DraftPickStatus;
    selectingTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    owningTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    originalTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
    futurePick: {
      id: string;
      seasonYear: number;
      round: number;
      overall: number | null;
      isUsed: boolean;
    } | null;
    selection: {
      id: string;
      outcome: DraftSelectionOutcome;
      playerId: string | null;
      playerName: string | null;
      playerPosition: string | null;
      salary: number | null;
      contractYears: number | null;
      madeAt: string | null;
    } | null;
  }[];
  currentPick: {
    id: string;
    pickNumber: number;
    round: number;
    status: DraftPickStatus;
    selectingTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    futurePick: {
      id: string;
      overall: number | null;
    } | null;
    salaryPreview: number;
  } | null;
  availablePlayers: {
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
    age: number | null;
    draftRank: number | null;
    draftTier: number | null;
    isRestricted: boolean;
    ownerTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
  }[];
  filters: {
    search: string;
    position: string;
    tier: string;
    sortBy: string;
    sortDir: string;
    availableOnly: boolean;
  };
  warnings: {
    code: string;
    message: string;
  }[];
  permissions: {
    canSelect: boolean;
    canPass: boolean;
    canForfeit: boolean;
    canCorrectOrder: boolean;
  };
  viewer: {
    isOnTheClock: boolean;
    canActOnCurrentPick: boolean;
    isCommissionerOverride: boolean;
    currentPickTeamName: string | null;
  };
  generatedAt: string;
};

export type VeteranAuctionSetupProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  defaultTitle: string;
  draft: DraftSessionSummary | null;
  config: {
    auctionMode: AuctionSessionMode;
    auctionEndsAt: string | null;
    auctionOpenBidWindowSeconds: number;
    auctionBidResetSeconds: number;
  };
  status: {
    needsDraftCreation: boolean;
    needsPoolGeneration: boolean;
    poolEntryCount: number;
    includedCount: number;
    excludedCount: number;
    warningCount: number;
    reviewState: "NOT_GENERATED" | "PENDING_REVIEW" | "FINALIZED";
    reviewStatus: AuctionPoolReviewStatus | null;
    isFinalized: boolean;
    canFinalize: boolean;
    canRegenerate: boolean;
    readyForStart: boolean;
    blockers: {
      code: string;
      message: string;
    }[];
    // VA-S9: blindWindowActive returned for EMERGENCY_FILL_IN auctions, false for STANDARD
    blindWindowActive?: boolean;
  };
  warnings: {
    code: string;
    message: string;
  }[];
  poolEntries: {
    id: string;
    status: AuctionPlayerPoolEntryStatus;
    player: {
      id: string;
      name: string;
      position: string;
      nflTeam: string | null;
      draftRank: number | null;
    };
    nominatedByTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
    currentLeadingTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
    currentLeadingBidAmount: number | null;
  }[];
  excludedPlayers: {
    id: string;
    reason: AuctionPoolExclusionReason;
    reasons: AuctionPoolExclusionReason[];
    player: {
      id: string;
      name: string;
      position: string;
      nflTeam: string | null;
      draftRank: number | null;
      ownerTeam: {
        id: string;
        name: string;
        abbreviation: string | null;
      } | null;
      isRestricted: boolean;
    };
  }[];
  emergencyCandidates: {
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
    draftRank: number | null;
    draftTier: number | null;
  }[];
  teams: {
    id: string;
    name: string;
    abbreviation: string | null;
  }[];
  permissions: {
    canManage: boolean;
    canCreateEmergencyFillIn: boolean;
  };
  generatedAt: string;
};

export type VeteranAuctionRoomProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  draft: DraftSessionSummary;
  config: {
    auctionMode: AuctionSessionMode;
    auctionEndsAt: string | null;
    // VA-S9: blindWindowActive returned for EMERGENCY_FILL_IN auctions, false for STANDARD
    blindWindowActive?: boolean;
    auctionOpenBidWindowSeconds: number;
    auctionBidResetSeconds: number;
  };
  entries: {
    id: string;
    status: AuctionPlayerPoolEntryStatus;
    player: {
      id: string;
      name: string;
      position: string;
      nflTeam: string | null;
      age: number | null;
      draftRank: number | null;
      draftTier: number | null;
      isRestricted: boolean;
    };
    currentLeadingBidAmount: number | null;
    currentLeadingTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    } | null;
    currentLeadingBidYears: number | null;
    currentLeadingBidValue: number | null;
    openBidClosesAt: string | null;
    // VAH-1: Removed blind bid properties (blindBidClosesAt, myBlindBid) 
    // to eliminate owner-facing blind-auction UI elements
    myOpenBid: {
      bidId: string;
      salaryAmount: number;
      contractYears: number;
      bidValue: number;
      submittedAt: string;
    } | null;
    award: {
      id: string;
      awardedTeam: {
        id: string;
        name: string;
        abbreviation: string | null;
      };
      salaryAmount: number;
      contractYears: number;
      bidValue: number;
      awardedAt: string;
    } | null;
    // VA-3: Recent bids array for bid history display
    recentBids: {
      bidId: string;
      salaryAmount: number;
      contractYears: number;
      bidValue: number;
      submittedAt: string;
      status: string;
      team: {
        id: string;
        name: string;
        abbreviation: string | null;
      };
    }[];
    review: {
      required: boolean;
      tiedBlindBids: {
        bidId: string;
        team: {
          id: string;
          name: string;
          abbreviation: string | null;
        };
        salaryAmount: number;
        contractYears: number;
        bidValue: number;
        submittedAt: string;
      }[];
    };
    blindEligibleTeamIds: string[] | null;
    reopenInfo: {
      reopenedAt: string;
      reason: string | null;
      previousStatus: string | null;
    } | null;
  }[];
  filters: {
    search: string;
    status: string;
    position: string;
  };
  warnings: {
    code: string;
    message: string;
  }[];
  permissions: {
    canBid: boolean;
    canSubmitBlindBid: boolean;
    canSyncStatus: boolean;
    canReviewBlindTies: boolean;
    canReopenEntries: boolean;
  };
  viewer: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    teamId: string | null;
  };
  generatedAt: string;
};
