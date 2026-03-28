import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_SOURCE_ENTITY_TYPES,
  type ActivityEventPayload,
  type ActivityEventType,
  type ActivityNamedPlayerRef,
  type ActivityNamedTeamRef,
  type ActivitySourceEntityType,
} from "@/lib/domain/activity/event-types";

export type FormattedActivityEvent<TEventType extends ActivityEventType = ActivityEventType> = {
  eventType: TEventType;
  title: string;
  body: string;
  payload: ActivityEventPayload<TEventType>;
  teamId?: string | null;
  relatedTeamId?: string | null;
  playerId?: string | null;
  sourceEntityType?: ActivitySourceEntityType | null;
  sourceEntityId?: string | null;
  dedupeKey?: string | null;
  occurredAt?: Date | null;
};

function titleCaseWords(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0)}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function formatLeaguePhaseLabel(phase: string) {
  return titleCaseWords(phase);
}

function formatPickLabel(round: number, pickNumber: number) {
  return `${round}.${String(pickNumber).padStart(2, "0")}`;
}

function formatYearsLabel(contractYears: number) {
  return contractYears === 1 ? "1-year deal" : `${contractYears}-year deal`;
}

function formatMismatchLabel(mismatchType: string) {
  return titleCaseWords(mismatchType);
}

function teamOrLeague(team: ActivityNamedTeamRef | null | undefined) {
  return team?.name ?? "league operations";
}

function createActivity<TEventType extends ActivityEventType>(
  eventType: TEventType,
  input: Omit<FormattedActivityEvent<TEventType>, "eventType">,
): FormattedActivityEvent<TEventType> {
  return {
    eventType,
    ...input,
  };
}

export function formatLifecyclePhaseTransitionActivity(input: {
  transitionId: string;
  fromPhase: string;
  toPhase: string;
  occurredAt?: Date | null;
}) {
  const fromLabel = formatLeaguePhaseLabel(input.fromPhase);
  const toLabel = formatLeaguePhaseLabel(input.toPhase);

  return createActivity(ACTIVITY_EVENT_TYPES.lifecycle.phaseTransitioned, {
    title: `League moved to ${toLabel}`,
    body: `${fromLabel} ended and ${toLabel} is now active.`,
    payload: {
      transitionId: input.transitionId,
      fromPhase: input.fromPhase,
      toPhase: input.toPhase,
    },
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.leaguePhaseTransition,
    sourceEntityId: input.transitionId,
    dedupeKey: `lifecycle.transition:${input.transitionId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatComplianceIssueCreatedActivity(input: {
  issueId: string;
  code: string;
  severity: string;
  team?: ActivityNamedTeamRef | null;
  occurredAt?: Date | null;
}) {
  const teamName = teamOrLeague(input.team);

  return createActivity(ACTIVITY_EVENT_TYPES.compliance.issueCreated, {
    title: "Compliance issue opened",
    body: `${teamName} has a new ${input.severity.toLowerCase()} compliance issue.`,
    payload: {
      issueId: input.issueId,
      code: input.code,
      severity: input.severity,
      teamId: input.team?.id ?? null,
      teamName: input.team?.name ?? null,
    },
    teamId: input.team?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.complianceIssue,
    sourceEntityId: input.issueId,
    dedupeKey: `compliance.issue.created:${input.issueId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatComplianceIssueResolvedActivity(input: {
  issueId: string;
  code: string;
  team?: ActivityNamedTeamRef | null;
  occurredAt?: Date | null;
}) {
  const teamName = teamOrLeague(input.team);

  return createActivity(ACTIVITY_EVENT_TYPES.compliance.issueResolved, {
    title: "Compliance issue resolved",
    body: `${teamName} cleared a compliance issue.`,
    payload: {
      issueId: input.issueId,
      code: input.code,
      teamId: input.team?.id ?? null,
      teamName: input.team?.name ?? null,
    },
    teamId: input.team?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.complianceIssue,
    sourceEntityId: input.issueId,
    dedupeKey: `compliance.issue.resolved:${input.issueId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatComplianceIssueWaivedActivity(input: {
  issueId: string;
  code: string;
  team?: ActivityNamedTeamRef | null;
  occurredAt?: Date | null;
}) {
  const teamName = teamOrLeague(input.team);

  return createActivity(ACTIVITY_EVENT_TYPES.compliance.issueWaived, {
    title: "Compliance issue waived",
    body: `${teamName} received a commissioner waiver on a compliance issue.`,
    payload: {
      issueId: input.issueId,
      code: input.code,
      teamId: input.team?.id ?? null,
      teamName: input.team?.name ?? null,
    },
    teamId: input.team?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.complianceIssue,
    sourceEntityId: input.issueId,
    dedupeKey: `compliance.issue.waived:${input.issueId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatCommissionerOverrideRecordedActivity(input: {
  overrideId: string;
  overrideType: string;
  entityType: string;
  entityId: string;
  team?: ActivityNamedTeamRef | null;
  occurredAt?: Date | null;
}) {
  return createActivity(ACTIVITY_EVENT_TYPES.commissioner.overrideRecorded, {
    title: "Commissioner override recorded",
    body: `A commissioner override was recorded for ${teamOrLeague(input.team)}.`,
    payload: {
      overrideId: input.overrideId,
      overrideType: input.overrideType,
      entityType: input.entityType,
      entityId: input.entityId,
      teamId: input.team?.id ?? null,
      teamName: input.team?.name ?? null,
    },
    teamId: input.team?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.commissionerOverride,
    sourceEntityId: input.overrideId,
    dedupeKey: `commissioner.override.recorded:${input.overrideId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatCommissionerRulingPublishedActivity(input: {
  overrideId: string;
  overrideType: string;
  entityType: string;
  entityId: string;
  team?: ActivityNamedTeamRef | null;
  internalReason?: string | null;
  occurredAt?: Date | null;
}) {
  void input.internalReason;

  return createActivity(ACTIVITY_EVENT_TYPES.commissioner.rulingPublished, {
    title: "Commissioner ruling published",
    body: `A commissioner ruling affecting ${teamOrLeague(input.team)} was published.`,
    payload: {
      overrideId: input.overrideId,
      overrideType: input.overrideType,
      entityType: input.entityType,
      entityId: input.entityId,
      teamId: input.team?.id ?? null,
      teamName: input.team?.name ?? null,
    },
    teamId: input.team?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.commissionerOverride,
    sourceEntityId: input.overrideId,
    dedupeKey: `commissioner.ruling.published:${input.overrideId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

function formatTradeProposalActivity<
  TEventType extends
    | typeof ACTIVITY_EVENT_TYPES.trade.proposalSubmitted
    | typeof ACTIVITY_EVENT_TYPES.trade.proposalAccepted
    | typeof ACTIVITY_EVENT_TYPES.trade.proposalDeclined
    | typeof ACTIVITY_EVENT_TYPES.trade.proposalReviewApproved
    | typeof ACTIVITY_EVENT_TYPES.trade.proposalReviewRejected,
>(input: {
  eventType: TEventType;
  proposalId: string;
  proposerTeam: ActivityNamedTeamRef;
  counterpartyTeam: ActivityNamedTeamRef;
  title: string;
  body: string;
  occurredAt?: Date | null;
}) {
  return createActivity(input.eventType, {
    title: input.title,
    body: input.body,
    payload: {
      proposalId: input.proposalId,
      proposerTeamId: input.proposerTeam.id,
      proposerTeamName: input.proposerTeam.name,
      counterpartyTeamId: input.counterpartyTeam.id,
      counterpartyTeamName: input.counterpartyTeam.name,
    } as ActivityEventPayload<TEventType>,
    teamId: input.proposerTeam.id,
    relatedTeamId: input.counterpartyTeam.id,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.tradeProposal,
    sourceEntityId: input.proposalId,
    dedupeKey: `${input.eventType}:${input.proposalId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatTradeProposalSubmittedActivity(input: {
  proposalId: string;
  proposerTeam: ActivityNamedTeamRef;
  counterpartyTeam: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  return formatTradeProposalActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalSubmitted,
    title: "Trade proposal submitted",
    body: `${input.proposerTeam.name} sent a trade proposal to ${input.counterpartyTeam.name}.`,
  });
}

export function formatTradeProposalAcceptedActivity(input: {
  proposalId: string;
  proposerTeam: ActivityNamedTeamRef;
  counterpartyTeam: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  return formatTradeProposalActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalAccepted,
    title: "Trade accepted",
    body: `${input.counterpartyTeam.name} accepted a trade proposal from ${input.proposerTeam.name}.`,
  });
}

export function formatTradeProposalDeclinedActivity(input: {
  proposalId: string;
  proposerTeam: ActivityNamedTeamRef;
  counterpartyTeam: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  return formatTradeProposalActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalDeclined,
    title: "Trade declined",
    body: `${input.counterpartyTeam.name} declined a trade proposal from ${input.proposerTeam.name}.`,
  });
}

export function formatTradeProposalReviewApprovedActivity(input: {
  proposalId: string;
  proposerTeam: ActivityNamedTeamRef;
  counterpartyTeam: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  return formatTradeProposalActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalReviewApproved,
    title: "Trade approved on review",
    body: `A commissioner approved the trade between ${input.proposerTeam.name} and ${input.counterpartyTeam.name}.`,
  });
}

export function formatTradeProposalReviewRejectedActivity(input: {
  proposalId: string;
  proposerTeam: ActivityNamedTeamRef;
  counterpartyTeam: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  return formatTradeProposalActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.trade.proposalReviewRejected,
    title: "Trade rejected on review",
    body: `A commissioner rejected the trade between ${input.proposerTeam.name} and ${input.counterpartyTeam.name}.`,
  });
}

export function formatRookieDraftPickSelectedActivity(input: {
  draftId: string;
  draftPickId?: string | null;
  selectionId?: string | null;
  round: number;
  pickNumber: number;
  team: ActivityNamedTeamRef;
  player?: ActivityNamedPlayerRef | null;
  occurredAt?: Date | null;
}) {
  const pickLabel = formatPickLabel(input.round, input.pickNumber);

  return createActivity(ACTIVITY_EVENT_TYPES.draft.rookiePickSelected, {
    title: "Rookie pick made",
    body: input.player
      ? `${input.team.name} selected ${input.player.name} at pick ${pickLabel}.`
      : `${input.team.name} completed pick ${pickLabel}.`,
    payload: {
      draftId: input.draftId,
      draftPickId: input.draftPickId ?? null,
      selectionId: input.selectionId ?? null,
      round: input.round,
      pickNumber: input.pickNumber,
      teamId: input.team.id,
      teamName: input.team.name,
      playerId: input.player?.id ?? null,
      playerName: input.player?.name ?? null,
    },
    teamId: input.team.id,
    playerId: input.player?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.draftSelection,
    sourceEntityId: input.selectionId ?? input.draftPickId ?? input.draftId,
    dedupeKey: `draft.rookie.pick_selected:${input.selectionId ?? input.draftPickId ?? input.draftId}:${pickLabel}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatRookieDraftPickPassedActivity(input: {
  draftId: string;
  draftPickId?: string | null;
  selectionId?: string | null;
  round: number;
  pickNumber: number;
  team: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  const pickLabel = formatPickLabel(input.round, input.pickNumber);

  return createActivity(ACTIVITY_EVENT_TYPES.draft.rookiePickPassed, {
    title: "Rookie pick passed",
    body: `${input.team.name} passed on pick ${pickLabel}.`,
    payload: {
      draftId: input.draftId,
      draftPickId: input.draftPickId ?? null,
      selectionId: input.selectionId ?? null,
      round: input.round,
      pickNumber: input.pickNumber,
      teamId: input.team.id,
      teamName: input.team.name,
    },
    teamId: input.team.id,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.draftSelection,
    sourceEntityId: input.selectionId ?? input.draftPickId ?? input.draftId,
    dedupeKey: `draft.rookie.pick_passed:${input.selectionId ?? input.draftPickId ?? input.draftId}:${pickLabel}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatRookieDraftPickForfeitedActivity(input: {
  draftId: string;
  draftPickId?: string | null;
  selectionId?: string | null;
  round: number;
  pickNumber: number;
  team: ActivityNamedTeamRef;
  occurredAt?: Date | null;
}) {
  const pickLabel = formatPickLabel(input.round, input.pickNumber);

  return createActivity(ACTIVITY_EVENT_TYPES.draft.rookiePickForfeited, {
    title: "Rookie pick forfeited",
    body: `${input.team.name} forfeited pick ${pickLabel}.`,
    payload: {
      draftId: input.draftId,
      draftPickId: input.draftPickId ?? null,
      selectionId: input.selectionId ?? null,
      round: input.round,
      pickNumber: input.pickNumber,
      teamId: input.team.id,
      teamName: input.team.name,
    },
    teamId: input.team.id,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.draftSelection,
    sourceEntityId: input.selectionId ?? input.draftPickId ?? input.draftId,
    dedupeKey: `draft.rookie.pick_forfeited:${input.selectionId ?? input.draftPickId ?? input.draftId}:${pickLabel}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatRookieDraftCompletedActivity(input: {
  draftId: string;
  title: string;
  occurredAt?: Date | null;
}) {
  return createActivity(ACTIVITY_EVENT_TYPES.draft.rookieCompleted, {
    title: "Rookie draft complete",
    body: `${input.title} is complete.`,
    payload: {
      draftId: input.draftId,
      title: input.title,
    },
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.draft,
    sourceEntityId: input.draftId,
    dedupeKey: `draft.rookie.completed:${input.draftId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatAuctionPlayerAwardedActivity(input: {
  draftId: string;
  awardId: string;
  team: ActivityNamedTeamRef;
  player: ActivityNamedPlayerRef;
  salaryAmount: number;
  contractYears: number;
  occurredAt?: Date | null;
}) {
  return createActivity(ACTIVITY_EVENT_TYPES.auction.playerAwarded, {
    title: "Auction award",
    body: `${input.team.name} won ${input.player.name} for $${input.salaryAmount} on a ${formatYearsLabel(input.contractYears)}.`,
    payload: {
      draftId: input.draftId,
      awardId: input.awardId,
      teamId: input.team.id,
      teamName: input.team.name,
      playerId: input.player.id,
      playerName: input.player.name,
      salaryAmount: input.salaryAmount,
      contractYears: input.contractYears,
    },
    teamId: input.team.id,
    playerId: input.player.id,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.auctionAward,
    sourceEntityId: input.awardId,
    dedupeKey: `auction.player_awarded:${input.awardId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatAuctionCompletedActivity(input: {
  draftId: string;
  title: string;
  occurredAt?: Date | null;
}) {
  return createActivity(ACTIVITY_EVENT_TYPES.auction.completed, {
    title: "Auction complete",
    body: `${input.title} is complete.`,
    payload: {
      draftId: input.draftId,
      title: input.title,
    },
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.draft,
    sourceEntityId: input.draftId,
    dedupeKey: `auction.completed:${input.draftId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

function formatSyncMismatchActivity<
  TEventType extends
    | typeof ACTIVITY_EVENT_TYPES.sync.mismatchResolved
    | typeof ACTIVITY_EVENT_TYPES.sync.mismatchEscalated,
>(input: {
  eventType: TEventType;
  mismatchId: string;
  mismatchType: string;
  severity: string;
  team?: ActivityNamedTeamRef | null;
  complianceIssueId?: string | null;
  title: string;
  body: string;
  occurredAt?: Date | null;
}) {
  return createActivity(input.eventType, {
    title: input.title,
    body: input.body,
    payload: {
      mismatchId: input.mismatchId,
      mismatchType: input.mismatchType,
      severity: input.severity,
      teamId: input.team?.id ?? null,
      teamName: input.team?.name ?? null,
      complianceIssueId: input.complianceIssueId ?? null,
    } as ActivityEventPayload<TEventType>,
    teamId: input.team?.id ?? null,
    sourceEntityType: ACTIVITY_SOURCE_ENTITY_TYPES.syncMismatch,
    sourceEntityId: input.mismatchId,
    dedupeKey: `${input.eventType}:${input.mismatchId}`,
    occurredAt: input.occurredAt ?? null,
  });
}

export function formatSyncMismatchResolvedActivity(input: {
  mismatchId: string;
  mismatchType: string;
  severity: string;
  team?: ActivityNamedTeamRef | null;
  complianceIssueId?: string | null;
  occurredAt?: Date | null;
}) {
  const scopeLabel = teamOrLeague(input.team);

  return formatSyncMismatchActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.sync.mismatchResolved,
    title: "Sync issue resolved",
    body: `${scopeLabel} resolved a ${formatMismatchLabel(input.mismatchType).toLowerCase()} sync issue.`,
  });
}

export function formatSyncMismatchEscalatedActivity(input: {
  mismatchId: string;
  mismatchType: string;
  severity: string;
  team?: ActivityNamedTeamRef | null;
  complianceIssueId?: string | null;
  occurredAt?: Date | null;
}) {
  const scopeLabel = teamOrLeague(input.team);

  return formatSyncMismatchActivity({
    ...input,
    eventType: ACTIVITY_EVENT_TYPES.sync.mismatchEscalated,
    title: "Sync issue escalated",
    body: `${scopeLabel} escalated a ${formatMismatchLabel(input.mismatchType).toLowerCase()} sync issue for follow-up.`,
  });
}
