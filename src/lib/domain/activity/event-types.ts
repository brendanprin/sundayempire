// User activity events are intentionally narrower than commissioner audit records.
// Raw operational detail stays in the audit read layer and out of these payloads.

export const ACTIVITY_EVENT_TYPES = {
  lifecycle: {
    phaseTransitioned: "lifecycle.phase_transitioned",
  },
  compliance: {
    issueCreated: "compliance.issue.created",
    issueResolved: "compliance.issue.resolved",
    issueWaived: "compliance.issue.waived",
  },
  commissioner: {
    overrideRecorded: "commissioner.override.recorded",
    rulingPublished: "commissioner.ruling.published",
  },
  trade: {
    proposalSubmitted: "trade.proposal.submitted",
    proposalAccepted: "trade.proposal.accepted",
    proposalDeclined: "trade.proposal.declined",
    proposalReviewApproved: "trade.proposal.review_approved",
    proposalReviewRejected: "trade.proposal.review_rejected",
  },
  draft: {
    rookiePickSelected: "draft.rookie.pick_selected",
    rookiePickPassed: "draft.rookie.pick_passed",
    rookiePickForfeited: "draft.rookie.pick_forfeited",
    rookieCompleted: "draft.rookie.completed",
  },
  auction: {
    playerAwarded: "auction.player_awarded",
    completed: "auction.completed",
    emergencyFillIn: "auction.emergency_fill_in",
  },
  sync: {
    mismatchResolved: "sync.mismatch.resolved",
    mismatchEscalated: "sync.mismatch.escalated",
  },
} as const;

export const ACTIVITY_SOURCE_ENTITY_TYPES = {
  leaguePhaseTransition: "LEAGUE_PHASE_TRANSITION",
  complianceIssue: "COMPLIANCE_ISSUE",
  commissionerOverride: "COMMISSIONER_OVERRIDE",
  tradeProposal: "TRADE_PROPOSAL",
  draftSelection: "DRAFT_SELECTION",
  draft: "DRAFT",
  auctionAward: "AUCTION_AWARD",
  syncMismatch: "SYNC_MISMATCH",
} as const;

type DeepValueOf<T> = T extends string
  ? T
  : T extends Record<string, infer TValue>
    ? DeepValueOf<TValue>
    : never;

export type ActivityEventType = DeepValueOf<typeof ACTIVITY_EVENT_TYPES>;
export type ActivitySourceEntityType = DeepValueOf<typeof ACTIVITY_SOURCE_ENTITY_TYPES>;

export type ActivityNamedTeamRef = {
  id: string;
  name: string;
};

export type ActivityNamedPlayerRef = {
  id: string;
  name: string;
};

export type ActivityEventPayloadMap = {
  [ACTIVITY_EVENT_TYPES.lifecycle.phaseTransitioned]: {
    transitionId: string;
    fromPhase: string;
    toPhase: string;
  };
  [ACTIVITY_EVENT_TYPES.compliance.issueCreated]: {
    issueId: string;
    code: string;
    severity: string;
    teamId?: string | null;
    teamName?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.compliance.issueResolved]: {
    issueId: string;
    code: string;
    teamId?: string | null;
    teamName?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.compliance.issueWaived]: {
    issueId: string;
    code: string;
    teamId?: string | null;
    teamName?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.commissioner.overrideRecorded]: {
    overrideId: string;
    overrideType: string;
    entityType: string;
    entityId: string;
    teamId?: string | null;
    teamName?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.commissioner.rulingPublished]: {
    overrideId: string;
    overrideType: string;
    entityType: string;
    entityId: string;
    teamId?: string | null;
    teamName?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.trade.proposalSubmitted]: {
    proposalId: string;
    proposerTeamId: string;
    proposerTeamName: string;
    counterpartyTeamId: string;
    counterpartyTeamName: string;
  };
  [ACTIVITY_EVENT_TYPES.trade.proposalAccepted]: {
    proposalId: string;
    proposerTeamId: string;
    proposerTeamName: string;
    counterpartyTeamId: string;
    counterpartyTeamName: string;
  };
  [ACTIVITY_EVENT_TYPES.trade.proposalDeclined]: {
    proposalId: string;
    proposerTeamId: string;
    proposerTeamName: string;
    counterpartyTeamId: string;
    counterpartyTeamName: string;
  };
  [ACTIVITY_EVENT_TYPES.trade.proposalReviewApproved]: {
    proposalId: string;
    proposerTeamId: string;
    proposerTeamName: string;
    counterpartyTeamId: string;
    counterpartyTeamName: string;
  };
  [ACTIVITY_EVENT_TYPES.trade.proposalReviewRejected]: {
    proposalId: string;
    proposerTeamId: string;
    proposerTeamName: string;
    counterpartyTeamId: string;
    counterpartyTeamName: string;
  };
  [ACTIVITY_EVENT_TYPES.draft.rookiePickSelected]: {
    draftId: string;
    draftPickId?: string | null;
    selectionId?: string | null;
    round: number;
    pickNumber: number;
    teamId: string;
    teamName: string;
    playerId?: string | null;
    playerName?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.draft.rookiePickPassed]: {
    draftId: string;
    draftPickId?: string | null;
    selectionId?: string | null;
    round: number;
    pickNumber: number;
    teamId: string;
    teamName: string;
  };
  [ACTIVITY_EVENT_TYPES.draft.rookiePickForfeited]: {
    draftId: string;
    draftPickId?: string | null;
    selectionId?: string | null;
    round: number;
    pickNumber: number;
    teamId: string;
    teamName: string;
  };
  [ACTIVITY_EVENT_TYPES.draft.rookieCompleted]: {
    draftId: string;
    title: string;
  };
  [ACTIVITY_EVENT_TYPES.auction.playerAwarded]: {
    draftId: string;
    awardId: string;
    teamId: string;
    teamName: string;
    playerId: string;
    playerName: string;
    salaryAmount: number;
    contractYears: number;
  };
  [ACTIVITY_EVENT_TYPES.auction.completed]: {
    draftId: string;
    title: string;
  };
  [ACTIVITY_EVENT_TYPES.auction.emergencyFillIn]: {
    draftId: string;
    filledCount: number;
    teamNames: string[];
  };
  [ACTIVITY_EVENT_TYPES.sync.mismatchResolved]: {
    mismatchId: string;
    mismatchType: string;
    severity: string;
    teamId?: string | null;
    teamName?: string | null;
    complianceIssueId?: string | null;
  };
  [ACTIVITY_EVENT_TYPES.sync.mismatchEscalated]: {
    mismatchId: string;
    mismatchType: string;
    severity: string;
    teamId?: string | null;
    teamName?: string | null;
    complianceIssueId?: string | null;
  };
};

export type ActivityEventPayload<TEventType extends ActivityEventType = ActivityEventType> =
  TEventType extends keyof ActivityEventPayloadMap ? ActivityEventPayloadMap[TEventType] : never;
