export type TradeWorkflowFinding = {
  code: string;
  severity: "error" | "warning";
  message: string;
  category: "hard_block" | "review" | "warning";
  teamId: string | null;
  context?: Record<string, unknown>;
};

export type TradeAssetSelectionInput = {
  assetType: "PLAYER" | "PICK";
  playerId?: string;
  futurePickId?: string;
};

export type TradeAssetView = {
  id: string;
  assetOrder: number;
  assetType: "PLAYER" | "PICK";
  fromTeamId: string;
  toTeamId: string;
  label: string;
  player: {
    id: string;
    name: string;
    position: string;
    isRestricted: boolean;
  } | null;
  futurePick: {
    id: string;
    seasonYear: number;
    round: number;
    overall: number | null;
    originalTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    currentTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    isUsed: boolean;
  } | null;
  contract: {
    id: string;
    salary: number;
    yearsRemaining: number;
    status: string;
    isFranchiseTag: boolean;
  } | null;
};

export type TradeTeamPostProjection = {
  teamId: string;
  teamName: string;
  rosterCountBefore: number;
  rosterCountAfter: number;
  activeCapBefore: number;
  activeCapAfter: number;
  deadCapBefore: number;
  deadCapAfter: number;
  hardCapBefore: number;
  hardCapAfter: number;
  complianceStatusBefore: "ok" | "warning" | "error";
  complianceStatusAfter: "ok" | "warning" | "error";
  introducedFindings: TradeWorkflowFinding[];
};

export type TradePostProjection = {
  available: boolean;
  teamA: TradeTeamPostProjection | null;
  teamB: TradeTeamPostProjection | null;
};

export type TradeEvaluationView = {
  id: string;
  trigger: "BUILDER_VALIDATE" | "SUBMIT" | "COUNTERPARTY_RESPONSE" | "COMMISSIONER_REVIEW";
  outcome:
    | "PASS"
    | "PASS_WITH_WARNING"
    | "FAIL_HARD_BLOCK"
    | "FAIL_REQUIRES_COMMISSIONER";
  isCurrent: boolean;
  isSubmissionSnapshot: boolean;
  assetFingerprint: string;
  findings: TradeWorkflowFinding[];
  remediation: {
    requiresCommissionerReview: boolean;
    reasons: string[];
  } | null;
  postTradeProjection: TradePostProjection;
  evaluatedAt: string;
  createdByUser: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export type TradeProposalSummary = {
  id: string;
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "ACCEPTED"
    | "DECLINED"
    | "REVIEW_PENDING"
    | "REVIEW_APPROVED"
    | "REVIEW_REJECTED"
    | "PROCESSED"
    | "CANCELED";
  proposerTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  counterpartyTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  assetCount: number;
  submittedAt: string | null;
  updatedAt: string;
  currentEvaluationOutcome:
    | "PASS"
    | "PASS_WITH_WARNING"
    | "FAIL_HARD_BLOCK"
    | "FAIL_REQUIRES_COMMISSIONER"
    | null;
  reviewRequired: boolean;
  hardBlocked: boolean;
};

export type TradeHomeResponse = {
  viewer: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    hasTeamAccess: boolean;
    teamId: string | null;
    teamName: string | null;
  };
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: string;
  };
  summary: {
    drafts: number;
    requiresResponse: number;
    outgoing: number;
    reviewQueue: number;
    settlementQueue: number;
    closed: number;
  };
  sections: {
    drafts: TradeProposalSummary[];
    requiresResponse: TradeProposalSummary[];
    outgoing: TradeProposalSummary[];
    reviewQueue: TradeProposalSummary[];
    settlementQueue: TradeProposalSummary[];
    closed: TradeProposalSummary[];
  };
};

export type TradeBuilderTeamAssetPool = {
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  };
  players: {
    playerId: string;
    contractId: string;
    label: string;
    name: string;
    position: string;
    salary: number;
    yearsRemaining: number;
    status: string;
    isFranchiseTag: boolean;
    isRestricted: boolean;
  }[];
  picks: {
    id: string;
    label: string;
    seasonYear: number;
    round: number;
    overall: number | null;
    originalTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
  }[];
  availability: {
    picksAvailable: boolean;
    pickDataIncomplete: boolean;
  };
};

export type TradeBuilderContextResponse = {
  viewer: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    hasTeamAccess: boolean;
    teamId: string | null;
    teamName: string | null;
  };
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: string;
  };
  teams: {
    id: string;
    name: string;
    abbreviation: string | null;
  }[];
  assetPools: TradeBuilderTeamAssetPool[];
  proposalDraft: TradeProposalDetailResponse["proposal"] | null;
};

export type TradeProposalDetailResponse = {
  viewer: {
    leagueRole: "COMMISSIONER" | "MEMBER";
    hasTeamAccess: boolean;
    teamId: string | null;
    teamName: string | null;
  };
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: string;
  };
  proposal: {
    id: string;
    status:
      | "DRAFT"
      | "SUBMITTED"
      | "ACCEPTED"
      | "DECLINED"
      | "REVIEW_PENDING"
      | "REVIEW_APPROVED"
      | "REVIEW_REJECTED"
      | "PROCESSED"
      | "CANCELED";
    proposerTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    counterpartyTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
    createdAt: string;
    updatedAt: string;
    submittedAt: string | null;
    counterpartyRespondedAt: string | null;
    reviewedAt: string | null;
    assets: TradeAssetView[];
  };
  currentEvaluation: TradeEvaluationView | null;
  evaluationHistory: TradeEvaluationView[];
  permissions: {
    canEditDraft: boolean;
    canSubmit: boolean;
    canAccept: boolean;
    canDecline: boolean;
    canCommissionerReview: boolean;
    canProcess: boolean;
  };
};

export type TradeProposalMutationResponse = {
  proposal: TradeProposalDetailResponse["proposal"];
  currentEvaluation: TradeEvaluationView | null;
};

export type TradeCommissionerReviewQueueResponse = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: string;
  };
  proposals: TradeProposalSummary[];
};
