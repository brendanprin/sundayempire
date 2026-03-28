import { Prisma } from "@prisma/client";
import type { AuthActor } from "@/lib/auth";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import {
  formatTradeProposalAcceptedActivity,
  formatTradeProposalDeclinedActivity,
  formatTradeProposalReviewApprovedActivity,
  formatTradeProposalReviewRejectedActivity,
  formatTradeProposalSubmittedActivity,
} from "@/lib/domain/activity/formatters";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createTradeAssemblyService } from "@/lib/domain/trades/trade-assembly-service";
import { createTradeNotificationService } from "@/lib/domain/trades/trade-notification-service";
import { createTradePolicyEvaluator } from "@/lib/domain/trades/trade-policy-evaluator";
import type {
  TradePackageInput,
  TradePolicyEvaluation,
  TradeProposalMutationResult,
} from "@/lib/domain/trades/types";
import { prisma } from "@/lib/prisma";
import { logRuntime } from "@/lib/runtime-log";
import { createTradeAssetRepository } from "@/lib/repositories/trades/trade-asset-repository";
import { createTradeEvaluationRepository } from "@/lib/repositories/trades/trade-evaluation-repository";
import {
  createTradeProposalRepository,
  type TradeProposalRecord,
} from "@/lib/repositories/trades/trade-proposal-repository";

function canViewProposal(actor: AuthActor, proposal: TradeProposalRecord) {
  if (actor.leagueRole === "COMMISSIONER" || !actor.teamId) {
    return true;
  }

  return (
    actor.teamId === proposal.proposerTeamId || actor.teamId === proposal.counterpartyTeamId
  );
}

function canEditDraft(actor: AuthActor, proposal: TradeProposalRecord) {
  if (proposal.status !== "DRAFT") {
    return false;
  }

  if (actor.leagueRole === "COMMISSIONER") {
    return true;
  }

  return actor.leagueRole === "MEMBER" && actor.teamId === proposal.proposerTeamId;
}

function canRespond(actor: AuthActor, proposal: TradeProposalRecord) {
  if (proposal.status !== "SUBMITTED") {
    return false;
  }

  if (actor.leagueRole === "COMMISSIONER") {
    return true;
  }

  return actor.leagueRole === "MEMBER" && actor.teamId === proposal.counterpartyTeamId;
}

function serializePersistedJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

const TRADE_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

function toLoggableError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

async function runBestEffortSideEffect(input: {
  action: "submit" | "accept" | "decline" | "review";
  proposalId: string;
  effect: () => Promise<unknown>;
}) {
  try {
    await input.effect();
  } catch (error) {
    logRuntime("warn", {
      event: "trade.proposal.side_effect_failed",
      action: input.action,
      proposalId: input.proposalId,
      ...toLoggableError(error),
    });
  }
}

function supportsActivityPublishing(value: unknown): value is Parameters<typeof createActivityPublisher>[0] {
  return typeof value === "object" && value !== null && "activityEvent" in value;
}

async function persistEvaluation(input: {
  tx: Prisma.TransactionClient;
  proposal: TradeProposalRecord;
  evaluation: TradePolicyEvaluation;
  createdByUserId: string | null;
  isSubmissionSnapshot?: boolean;
}) {
  const evaluationRepository = createTradeEvaluationRepository(input.tx);
  await evaluationRepository.markAllNotCurrent(input.proposal.id);
  return evaluationRepository.create({
    proposalId: input.proposal.id,
    leagueId: input.proposal.leagueId,
    seasonId: input.proposal.seasonId,
    createdByUserId: input.createdByUserId,
    trigger: input.evaluation.trigger,
    outcome: input.evaluation.outcome,
    assetFingerprint: input.evaluation.assetFingerprint,
    findingsJson: serializePersistedJson(input.evaluation.findings),
    remediationJson: serializePersistedJson(input.evaluation.remediation),
    postTradeProjectionJson: serializePersistedJson(input.evaluation.postTradeProjection),
    isSubmissionSnapshot: input.isSubmissionSnapshot ?? false,
  });
}

export function createTradeProposalWorkflowService(
  client = prisma,
  dependencies?: {
    tradeAssemblyService?: Pick<
      ReturnType<typeof createTradeAssemblyService>,
      "prepareTradePackage"
    >;
    tradePolicyEvaluator?: Pick<
      ReturnType<typeof createTradePolicyEvaluator>,
      "evaluate"
    >;
    notificationService?: Pick<
      ReturnType<typeof createTradeNotificationService>,
      | "notifyCounterpartySubmission"
      | "notifyCommissionerReview"
      | "notifyProposalDecision"
    >;
    activityPublisher?: Pick<ReturnType<typeof createActivityPublisher>, "publishSafe"> | null;
    commissionerOverrideFactory?: typeof createCommissionerOverrideService;
  },
) {
  const proposalRepository = createTradeProposalRepository(client);
  const tradeAssemblyService =
    dependencies?.tradeAssemblyService ?? createTradeAssemblyService(client);
  const tradePolicyEvaluator =
    dependencies?.tradePolicyEvaluator ?? createTradePolicyEvaluator(client);
  const notificationService =
    dependencies?.notificationService ?? createTradeNotificationService(client);
  const activityPublisher =
    dependencies?.activityPublisher ??
    (supportsActivityPublishing(client) ? createActivityPublisher(client) : null);
  const commissionerOverrideFactory =
    dependencies?.commissionerOverrideFactory ?? createCommissionerOverrideService;

  async function loadProposalOrThrow(proposalId: string) {
    const proposal = await proposalRepository.findById(proposalId);
    if (!proposal) {
      throw new Error("TRADE_NOT_FOUND");
    }

    return proposal;
  }

  async function evaluateProposalRecord(input: {
    proposal: TradeProposalRecord;
    trigger: TradePolicyEvaluation["trigger"];
  }) {
    return tradePolicyEvaluator.evaluate({
      leagueId: input.proposal.leagueId,
      seasonId: input.proposal.seasonId,
      proposerTeamId: input.proposal.proposerTeamId,
      counterpartyTeamId: input.proposal.counterpartyTeamId,
      assets: input.proposal.assets.map((asset) => ({
        fromTeamId: asset.fromTeamId,
        toTeamId: asset.toTeamId,
        assetType: asset.assetType,
        playerId: asset.playerId,
        futurePickId: asset.futurePickId,
        contractId: asset.contractId,
        assetOrder: asset.assetOrder,
        snapshotLabel: asset.snapshotLabel,
      })),
      trigger: input.trigger,
    });
  }

  return {
    async createDraft(input: {
      actor: AuthActor;
      package: TradePackageInput;
    }): Promise<TradeProposalMutationResult> {
      if (input.actor.leagueRole === "MEMBER" && !input.actor.teamId) {
        throw new Error("FORBIDDEN");
      }

      if (
        input.actor.leagueRole === "MEMBER" &&
        input.actor.teamId !== input.package.proposerTeamId
      ) {
        throw new Error("FORBIDDEN");
      }

      const prepared = await tradeAssemblyService.prepareTradePackage(input.package);

      return client.$transaction(async (tx) => {
        const txProposalRepository = createTradeProposalRepository(tx);
        const txAssetRepository = createTradeAssetRepository(tx);
        const proposal = await txProposalRepository.create({
          leagueId: input.package.leagueId,
          seasonId: input.package.seasonId,
          proposerTeamId: prepared.proposerTeam.id,
          counterpartyTeamId: prepared.counterpartyTeam.id,
          createdByUserId: input.actor.userId,
        });

        await txAssetRepository.replaceForTradeProposal({
          tradeProposalId: proposal.id,
          assets: prepared.assets,
        });

        const hydratedProposal = await txProposalRepository.findById(proposal.id);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await evaluateProposalRecord({
          proposal: hydratedProposal,
          trigger: "BUILDER_VALIDATE",
        });

        await persistEvaluation({
          tx,
          proposal: hydratedProposal,
          evaluation,
          createdByUserId: input.actor.userId,
        });

        return {
          proposalId: hydratedProposal.id,
          status: hydratedProposal.status,
        };
      }, TRADE_TRANSACTION_OPTIONS);
    },

    async updateDraft(input: {
      actor: AuthActor;
      proposalId: string;
      package: TradePackageInput;
    }): Promise<TradeProposalMutationResult> {
      const proposal = await loadProposalOrThrow(input.proposalId);
      if (!canEditDraft(input.actor, proposal)) {
        throw new Error("FORBIDDEN");
      }

      const prepared = await tradeAssemblyService.prepareTradePackage(input.package);

      return client.$transaction(async (tx) => {
        const txProposalRepository = createTradeProposalRepository(tx);
        const txAssetRepository = createTradeAssetRepository(tx);
        await txProposalRepository.update(input.proposalId, {
          proposerTeamId: prepared.proposerTeam.id,
          counterpartyTeamId: prepared.counterpartyTeam.id,
        });

        await txAssetRepository.replaceForTradeProposal({
          tradeProposalId: input.proposalId,
          assets: prepared.assets,
        });

        const hydratedProposal = await txProposalRepository.findById(input.proposalId);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await evaluateProposalRecord({
          proposal: hydratedProposal,
          trigger: "BUILDER_VALIDATE",
        });

        await persistEvaluation({
          tx,
          proposal: hydratedProposal,
          evaluation,
          createdByUserId: input.actor.userId,
        });

        return {
          proposalId: hydratedProposal.id,
          status: hydratedProposal.status,
        };
      }, TRADE_TRANSACTION_OPTIONS);
    },

    async evaluate(input: { actor: AuthActor; proposalId: string }) {
      const proposal = await loadProposalOrThrow(input.proposalId);
      if (!canViewProposal(input.actor, proposal)) {
        throw new Error("FORBIDDEN");
      }

      return client.$transaction(async (tx) => {
        const hydratedProposal = await createTradeProposalRepository(tx).findById(proposal.id);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await evaluateProposalRecord({
          proposal: hydratedProposal,
          trigger: "BUILDER_VALIDATE",
        });

        await persistEvaluation({
          tx,
          proposal: hydratedProposal,
          evaluation,
          createdByUserId: input.actor.userId,
        });

        return {
          proposalId: hydratedProposal.id,
          status: hydratedProposal.status,
        };
      }, TRADE_TRANSACTION_OPTIONS);
    },

    async submit(input: { actor: AuthActor; proposalId: string }) {
      const proposal = await loadProposalOrThrow(input.proposalId);
      if (!canEditDraft(input.actor, proposal)) {
        throw new Error("FORBIDDEN");
      }

      const result = await client.$transaction(async (tx) => {
        const txProposalRepository = createTradeProposalRepository(tx);
        const hydratedProposal = await txProposalRepository.findById(proposal.id);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await evaluateProposalRecord({
          proposal: hydratedProposal,
          trigger: "SUBMIT",
        });

        if (evaluation.outcome === "FAIL_HARD_BLOCK") {
          throw new Error("TRADE_STATE_CONFLICT");
        }

        const nextStatus =
          evaluation.outcome === "FAIL_REQUIRES_COMMISSIONER"
            ? "REVIEW_PENDING"
            : "SUBMITTED";

        const updated = await txProposalRepository.update(proposal.id, {
          status: nextStatus,
          submittedByUserId: input.actor.userId,
          submittedAt: new Date(),
        });

        await persistEvaluation({
          tx,
          proposal: updated,
          evaluation,
          createdByUserId: input.actor.userId,
          isSubmissionSnapshot: true,
        });

        return {
          proposalId: updated.id,
          status: updated.status,
          activityEvent: formatTradeProposalSubmittedActivity({
            proposalId: updated.id,
            proposerTeam: {
              id: updated.proposerTeamId,
              name: updated.proposerTeam.name,
            },
            counterpartyTeam: {
              id: updated.counterpartyTeamId,
              name: updated.counterpartyTeam.name,
            },
            occurredAt: updated.submittedAt ?? updated.updatedAt,
          }),
          notification:
            nextStatus === "REVIEW_PENDING"
              ? {
                  kind: "commissioner-review" as const,
                  leagueId: updated.leagueId,
                  seasonId: updated.seasonId,
                  actorUserId: input.actor.userId,
                  title: "Trade proposal needs commissioner review",
                  body: `${updated.proposerTeam.name} vs ${updated.counterpartyTeam.name} requires commissioner review.`,
                  dedupeKey: `trade-review-pending:${updated.id}:${updated.updatedAt.toISOString()}`,
                }
              : {
                  kind: "counterparty-submission" as const,
                  leagueId: updated.leagueId,
                  seasonId: updated.seasonId,
                  counterpartyTeamId: updated.counterpartyTeamId,
                  actorUserId: input.actor.userId,
                  title: "New trade proposal waiting",
                  body: `${updated.proposerTeam.name} sent a trade proposal to ${updated.counterpartyTeam.name}.`,
                  dedupeKey: `trade-submitted:${updated.id}:${updated.updatedAt.toISOString()}`,
                },
        };
      }, TRADE_TRANSACTION_OPTIONS);

      await runBestEffortSideEffect({
        action: "submit",
        proposalId: result.proposalId,
        effect: () =>
          result.notification.kind === "commissioner-review"
            ? notificationService.notifyCommissionerReview({
                leagueId: result.notification.leagueId,
                seasonId: result.notification.seasonId,
                actorUserId: result.notification.actorUserId,
                title: result.notification.title,
                body: result.notification.body,
                dedupeKey: result.notification.dedupeKey,
              })
            : notificationService.notifyCounterpartySubmission({
                leagueId: result.notification.leagueId,
                seasonId: result.notification.seasonId,
                counterpartyTeamId: result.notification.counterpartyTeamId,
                actorUserId: result.notification.actorUserId,
                title: result.notification.title,
                body: result.notification.body,
                dedupeKey: result.notification.dedupeKey,
              }),
      });

      if (activityPublisher) {
        await runBestEffortSideEffect({
          action: "submit",
          proposalId: result.proposalId,
          effect: () =>
            activityPublisher.publishSafe({
              leagueId: proposal.leagueId,
              seasonId: proposal.seasonId,
              actorUserId: input.actor.userId,
              ...result.activityEvent,
            }),
        });
      }

      return {
        proposalId: result.proposalId,
        status: result.status,
      };
    },

    async accept(input: { actor: AuthActor; proposalId: string }) {
      const proposal = await loadProposalOrThrow(input.proposalId);
      if (!canRespond(input.actor, proposal)) {
        throw new Error("FORBIDDEN");
      }

      const result = await client.$transaction(async (tx) => {
        const txProposalRepository = createTradeProposalRepository(tx);
        const hydratedProposal = await txProposalRepository.findById(proposal.id);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await evaluateProposalRecord({
          proposal: hydratedProposal,
          trigger: "COUNTERPARTY_RESPONSE",
        });

        if (evaluation.outcome === "FAIL_HARD_BLOCK") {
          throw new Error("TRADE_STATE_CONFLICT");
        }

        const nextStatus =
          evaluation.outcome === "FAIL_REQUIRES_COMMISSIONER"
            ? "REVIEW_PENDING"
            : "ACCEPTED";

        const updated = await txProposalRepository.update(proposal.id, {
          status: nextStatus,
          counterpartyRespondedByUserId: input.actor.userId,
          counterpartyRespondedAt: new Date(),
        });

        await persistEvaluation({
          tx,
          proposal: updated,
          evaluation,
          createdByUserId: input.actor.userId,
          isSubmissionSnapshot: true,
        });

        return {
          proposalId: updated.id,
          status: updated.status,
          activityEvent:
            nextStatus === "ACCEPTED"
              ? formatTradeProposalAcceptedActivity({
                  proposalId: updated.id,
                  proposerTeam: {
                    id: updated.proposerTeamId,
                    name: updated.proposerTeam.name,
                  },
                  counterpartyTeam: {
                    id: updated.counterpartyTeamId,
                    name: updated.counterpartyTeam.name,
                  },
                  occurredAt: updated.counterpartyRespondedAt ?? updated.updatedAt,
                })
              : null,
          notification:
            nextStatus === "REVIEW_PENDING"
              ? {
                  kind: "commissioner-review" as const,
                  leagueId: updated.leagueId,
                  seasonId: updated.seasonId,
                  actorUserId: input.actor.userId,
                  title: "Accepted trade now needs commissioner review",
                  body: `${updated.proposerTeam.name} vs ${updated.counterpartyTeam.name} was accepted and now needs commissioner review.`,
                  dedupeKey: `trade-review-pending:${updated.id}:${updated.updatedAt.toISOString()}`,
                }
              : {
                  kind: "proposal-decision" as const,
                  leagueId: updated.leagueId,
                  seasonId: updated.seasonId,
                  proposerTeamId: updated.proposerTeamId,
                  counterpartyTeamId: updated.counterpartyTeamId,
                  actorUserId: input.actor.userId,
                  eventType: "trade.proposal.accepted" as const,
                  title: "Trade proposal accepted",
                  body: `${updated.counterpartyTeam.name} accepted a trade from ${updated.proposerTeam.name}.`,
                  dedupeKey: `trade-accepted:${updated.id}:${updated.updatedAt.toISOString()}`,
                },
        };
      }, TRADE_TRANSACTION_OPTIONS);

      await runBestEffortSideEffect({
        action: "accept",
        proposalId: result.proposalId,
        effect: () =>
          result.notification.kind === "commissioner-review"
            ? notificationService.notifyCommissionerReview({
                leagueId: result.notification.leagueId,
                seasonId: result.notification.seasonId,
                actorUserId: result.notification.actorUserId,
                title: result.notification.title,
                body: result.notification.body,
                dedupeKey: result.notification.dedupeKey,
              })
            : notificationService.notifyProposalDecision({
                leagueId: result.notification.leagueId,
                seasonId: result.notification.seasonId,
                proposerTeamId: result.notification.proposerTeamId,
                counterpartyTeamId: result.notification.counterpartyTeamId,
                actorUserId: result.notification.actorUserId,
                eventType: result.notification.eventType,
                title: result.notification.title,
                body: result.notification.body,
                dedupeKey: result.notification.dedupeKey,
              }),
      });

      if (activityPublisher && result.activityEvent) {
        const activityEvent = result.activityEvent;
        await runBestEffortSideEffect({
          action: "accept",
          proposalId: result.proposalId,
          effect: () =>
            activityPublisher.publishSafe({
              leagueId: proposal.leagueId,
              seasonId: proposal.seasonId,
              actorUserId: input.actor.userId,
              ...activityEvent,
            }),
        });
      }

      return {
        proposalId: result.proposalId,
        status: result.status,
      };
    },

    async decline(input: { actor: AuthActor; proposalId: string }) {
      const proposal = await loadProposalOrThrow(input.proposalId);
      if (!canRespond(input.actor, proposal)) {
        throw new Error("FORBIDDEN");
      }

      const updated = await client.tradeProposal.update({
        where: {
          id: proposal.id,
        },
        data: {
          status: "DECLINED",
          counterpartyRespondedByUserId: input.actor.userId,
          counterpartyRespondedAt: new Date(),
        },
        include: {
          proposerTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          counterpartyTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      });

      await runBestEffortSideEffect({
        action: "decline",
        proposalId: updated.id,
        effect: () =>
          notificationService.notifyProposalDecision({
            leagueId: updated.leagueId,
            seasonId: updated.seasonId,
            proposerTeamId: updated.proposerTeamId,
            counterpartyTeamId: updated.counterpartyTeamId,
            actorUserId: input.actor.userId,
            eventType: "trade.proposal.declined",
            title: "Trade proposal declined",
            body: `${updated.counterpartyTeam.name} declined a trade from ${updated.proposerTeam.name}.`,
              dedupeKey: `trade-declined:${updated.id}:${updated.updatedAt.toISOString()}`,
            }),
      });

      if (activityPublisher) {
        await runBestEffortSideEffect({
          action: "decline",
          proposalId: updated.id,
          effect: () =>
            activityPublisher.publishSafe({
              leagueId: updated.leagueId,
              seasonId: updated.seasonId,
              actorUserId: input.actor.userId,
              ...formatTradeProposalDeclinedActivity({
                proposalId: updated.id,
                proposerTeam: {
                  id: updated.proposerTeamId,
                  name: updated.proposerTeam.name,
                },
                counterpartyTeam: {
                  id: updated.counterpartyTeamId,
                  name: updated.counterpartyTeam.name,
                },
                occurredAt: updated.counterpartyRespondedAt ?? updated.updatedAt,
              }),
            }),
        });
      }

      return {
        proposalId: updated.id,
        status: updated.status,
      };
    },

    async review(input: {
      actor: AuthActor;
      proposalId: string;
      decision: "approve" | "reject";
      reason: string;
    }) {
      if (input.actor.leagueRole !== "COMMISSIONER") {
        throw new Error("FORBIDDEN");
      }

      if (!input.reason.trim()) {
        throw new Error("OVERRIDE_REASON_REQUIRED");
      }

      const proposal = await loadProposalOrThrow(input.proposalId);
      if (proposal.status !== "REVIEW_PENDING") {
        throw new Error("TRADE_STATE_CONFLICT");
      }

      const result = await client.$transaction(async (tx) => {
        const txProposalRepository = createTradeProposalRepository(tx);
        const txOverrideService = commissionerOverrideFactory(tx);
        const hydratedProposal = await txProposalRepository.findById(proposal.id);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await evaluateProposalRecord({
          proposal: hydratedProposal,
          trigger: "COMMISSIONER_REVIEW",
        });

        if (input.decision === "approve" && evaluation.outcome === "FAIL_HARD_BLOCK") {
          throw new Error("TRADE_STATE_CONFLICT");
        }

        const nextStatus = input.decision === "approve" ? "REVIEW_APPROVED" : "REVIEW_REJECTED";

        const updated = await txProposalRepository.update(proposal.id, {
          status: nextStatus,
          reviewedByUserId: input.actor.userId,
          reviewedAt: new Date(),
        });

        await persistEvaluation({
          tx,
          proposal: updated,
          evaluation,
          createdByUserId: input.actor.userId,
          isSubmissionSnapshot: true,
        });

        const override = await txOverrideService.recordOverride({
          leagueId: updated.leagueId,
          seasonId: updated.seasonId,
          teamId: null,
          actorUserId: input.actor.userId,
          actorRoleSnapshot: input.actor.leagueRole,
          overrideType: "MANUAL_RULING",
          reason: input.reason.trim(),
          entityType: "trade_proposal",
          entityId: updated.id,
          beforeJson: serializePersistedJson({
            status: hydratedProposal.status,
          }),
          afterJson: serializePersistedJson({
            status: nextStatus,
          }),
          metadata: serializePersistedJson({
            decision: input.decision,
            evaluationOutcome: evaluation.outcome,
          }),
          notify: false,
        });

        return {
          proposalId: updated.id,
          status: updated.status,
          overrideId: override.id,
          activityEvent:
            input.decision === "approve"
              ? formatTradeProposalReviewApprovedActivity({
                  proposalId: updated.id,
                  proposerTeam: {
                    id: updated.proposerTeamId,
                    name: updated.proposerTeam.name,
                  },
                  counterpartyTeam: {
                    id: updated.counterpartyTeamId,
                    name: updated.counterpartyTeam.name,
                  },
                  occurredAt: updated.reviewedAt ?? updated.updatedAt,
                })
              : formatTradeProposalReviewRejectedActivity({
                  proposalId: updated.id,
                  proposerTeam: {
                    id: updated.proposerTeamId,
                    name: updated.proposerTeam.name,
                  },
                  counterpartyTeam: {
                    id: updated.counterpartyTeamId,
                    name: updated.counterpartyTeam.name,
                  },
                  occurredAt: updated.reviewedAt ?? updated.updatedAt,
                }),
          notification: {
            proposalDecision: {
              leagueId: updated.leagueId,
              seasonId: updated.seasonId,
              proposerTeamId: updated.proposerTeamId,
              counterpartyTeamId: updated.counterpartyTeamId,
              actorUserId: input.actor.userId,
              eventType:
                input.decision === "approve"
                  ? ("trade.proposal.review_approved" as const)
                  : ("trade.proposal.review_rejected" as const),
              title:
                input.decision === "approve"
                  ? "Commissioner approved a trade"
                  : "Commissioner rejected a trade",
              body: input.reason.trim(),
              dedupeKey: `trade-review:${updated.id}:${updated.updatedAt.toISOString()}`,
            },
            override: {
              leagueId: updated.leagueId,
              seasonId: updated.seasonId,
              teamId: null,
              overrideId: override.id,
              actorUserId: input.actor.userId,
              title:
                input.decision === "approve"
                  ? "Commissioner approved a flagged trade"
                  : "Commissioner rejected a flagged trade",
              body: input.reason.trim(),
              dedupeKey: `MANUAL_RULING:trade_proposal:${updated.id}:${override.id}`,
            },
          },
        };
      }, TRADE_TRANSACTION_OPTIONS);

      const reviewActivityEvent = result.activityEvent;

      await Promise.allSettled([
        runBestEffortSideEffect({
          action: "review",
          proposalId: result.proposalId,
          effect: () =>
            commissionerOverrideFactory(client).notifyRecordedOverride({
              leagueId: result.notification.override.leagueId,
              seasonId: result.notification.override.seasonId,
              teamId: result.notification.override.teamId,
              overrideId: result.notification.override.overrideId,
              actorUserId: result.notification.override.actorUserId,
              title: result.notification.override.title,
              body: result.notification.override.body,
              dedupeKey: result.notification.override.dedupeKey,
            }),
        }),
        runBestEffortSideEffect({
          action: "review",
          proposalId: result.proposalId,
          effect: () =>
            notificationService.notifyProposalDecision({
              leagueId: result.notification.proposalDecision.leagueId,
              seasonId: result.notification.proposalDecision.seasonId,
              proposerTeamId: result.notification.proposalDecision.proposerTeamId,
              counterpartyTeamId: result.notification.proposalDecision.counterpartyTeamId,
              actorUserId: result.notification.proposalDecision.actorUserId,
              eventType: result.notification.proposalDecision.eventType,
              title: result.notification.proposalDecision.title,
              body: result.notification.proposalDecision.body,
              dedupeKey: result.notification.proposalDecision.dedupeKey,
            }),
        }),
        activityPublisher
          ? runBestEffortSideEffect({
              action: "review",
              proposalId: result.proposalId,
              effect: () =>
                activityPublisher.publishSafe({
                  leagueId: proposal.leagueId,
                  seasonId: proposal.seasonId,
                  actorUserId: input.actor.userId,
                  ...reviewActivityEvent,
                }),
            })
          : Promise.resolve(null),
      ]);

      return {
        proposalId: result.proposalId,
        status: result.status,
      };
    },
  };
}
