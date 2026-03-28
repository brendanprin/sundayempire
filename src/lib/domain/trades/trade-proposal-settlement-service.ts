import { TransactionType } from "@prisma/client";
import type { AuthActor } from "@/lib/auth";
import { createTradePolicyEvaluator } from "@/lib/domain/trades/trade-policy-evaluator";
import type {
  TradePolicyEvaluation,
  TradeProposalMutationResult,
} from "@/lib/domain/trades/types";
import { prisma } from "@/lib/prisma";
import {
  createTradeProposalRepository,
  type TradeProposalRecord,
} from "@/lib/repositories/trades/trade-proposal-repository";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";

const TRADE_SETTLEMENT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 20_000,
} as const;

function canProcessProposal(actor: AuthActor, proposal: TradeProposalRecord) {
  return (
    actor.leagueRole === "COMMISSIONER" &&
    (proposal.status === "ACCEPTED" || proposal.status === "REVIEW_APPROVED")
  );
}

function toSettlementTrigger(
  status: TradeProposalRecord["status"],
): TradePolicyEvaluation["trigger"] {
  return status === "REVIEW_APPROVED" ? "COMMISSIONER_REVIEW" : "COUNTERPARTY_RESPONSE";
}

export function createTradeProposalSettlementService(
  client = prisma,
  dependencies?: {
    tradePolicyEvaluator?: Pick<
      ReturnType<typeof createTradePolicyEvaluator>,
      "evaluate"
    >;
  },
) {
  const proposalRepository = createTradeProposalRepository(client);
  const tradePolicyEvaluator =
    dependencies?.tradePolicyEvaluator ?? createTradePolicyEvaluator(client);

  async function loadProposalOrThrow(proposalId: string) {
    const proposal = await proposalRepository.findById(proposalId);
    if (!proposal) {
      throw new Error("TRADE_NOT_FOUND");
    }

    return proposal;
  }

  return {
    async settle(input: {
      actor: AuthActor;
      proposalId: string;
    }): Promise<TradeProposalMutationResult> {
      const proposal = await loadProposalOrThrow(input.proposalId);
      if (proposal.leagueId !== input.actor.leagueId) {
        throw new Error("TRADE_NOT_FOUND");
      }
      if (!canProcessProposal(input.actor, proposal)) {
        throw new Error(
          input.actor.leagueRole !== "COMMISSIONER" ? "FORBIDDEN" : "TRADE_STATE_CONFLICT",
        );
      }

      return client.$transaction(async (tx) => {
        const txProposalRepository = createTradeProposalRepository(tx);
        const hydratedProposal = await txProposalRepository.findById(proposal.id);
        if (!hydratedProposal) {
          throw new Error("TRADE_NOT_FOUND");
        }

        const evaluation = await tradePolicyEvaluator.evaluate({
          leagueId: hydratedProposal.leagueId,
          seasonId: hydratedProposal.seasonId,
          proposerTeamId: hydratedProposal.proposerTeamId,
          counterpartyTeamId: hydratedProposal.counterpartyTeamId,
          assets: hydratedProposal.assets.map((asset) => ({
            fromTeamId: asset.fromTeamId,
            toTeamId: asset.toTeamId,
            assetType: asset.assetType,
            playerId: asset.playerId,
            futurePickId: asset.futurePickId,
            contractId: asset.contractId,
            assetOrder: asset.assetOrder,
            snapshotLabel: asset.snapshotLabel,
          })),
          trigger: toSettlementTrigger(hydratedProposal.status),
        });

        if (evaluation.outcome === "FAIL_HARD_BLOCK") {
          throw new Error("TRADE_STATE_CONFLICT");
        }

        const teamNameById = new Map([
          [hydratedProposal.proposerTeam.id, hydratedProposal.proposerTeam.name],
          [hydratedProposal.counterpartyTeam.id, hydratedProposal.counterpartyTeam.name],
        ]);

        for (const asset of hydratedProposal.assets) {
          if (asset.assetType === "PLAYER" && asset.playerId) {
            const [contractResult, rosterResult] = await Promise.all([
              tx.contract.updateMany({
                where: asset.contractId
                  ? {
                      id: asset.contractId,
                      seasonId: hydratedProposal.seasonId,
                      teamId: asset.fromTeamId,
                    }
                  : {
                      seasonId: hydratedProposal.seasonId,
                      teamId: asset.fromTeamId,
                      playerId: asset.playerId,
                    },
                data: {
                  teamId: asset.toTeamId,
                },
              }),
              tx.rosterSlot.updateMany({
                where: {
                  seasonId: hydratedProposal.seasonId,
                  teamId: asset.fromTeamId,
                  playerId: asset.playerId,
                },
                data: {
                  teamId: asset.toTeamId,
                },
              }),
            ]);

            if (contractResult.count < 1 || rosterResult.count < 1) {
              throw new Error(
                `Unable to transfer player ${asset.playerId}: missing contract or roster row for fromTeam ${asset.fromTeamId}.`,
              );
            }

            await Promise.all([
              logTransaction(tx, {
                leagueId: hydratedProposal.leagueId,
                seasonId: hydratedProposal.seasonId,
                teamId: asset.fromTeamId,
                playerId: asset.playerId,
                type: TransactionType.TRADE_OUT,
                summary: `Traded out ${asset.player?.name ?? "player"} to ${
                  teamNameById.get(asset.toTeamId) ?? "destination team"
                }.`,
                audit: {
                  actor: auditActorFromRequestActor(input.actor),
                  source: "tradeProposalSettlementService.settle",
                  entities: {
                    tradeProposalId: hydratedProposal.id,
                    tradeId: hydratedProposal.id,
                    assetId: asset.id,
                    assetType: asset.assetType,
                    playerId: asset.playerId,
                    fromTeamId: asset.fromTeamId,
                    toTeamId: asset.toTeamId,
                  },
                  before: {
                    teamId: asset.fromTeamId,
                    status: hydratedProposal.status,
                  },
                  after: {
                    teamId: asset.toTeamId,
                    status: "PROCESSED",
                  },
                },
                metadata: {
                  teamNameFrom: teamNameById.get(asset.fromTeamId) ?? null,
                  teamNameTo: teamNameById.get(asset.toTeamId) ?? null,
                },
              }),
              logTransaction(tx, {
                leagueId: hydratedProposal.leagueId,
                seasonId: hydratedProposal.seasonId,
                teamId: asset.toTeamId,
                playerId: asset.playerId,
                type: TransactionType.TRADE_IN,
                summary: `Traded in ${asset.player?.name ?? "player"} from ${
                  teamNameById.get(asset.fromTeamId) ?? "sending team"
                }.`,
                audit: {
                  actor: auditActorFromRequestActor(input.actor),
                  source: "tradeProposalSettlementService.settle",
                  entities: {
                    tradeProposalId: hydratedProposal.id,
                    tradeId: hydratedProposal.id,
                    assetId: asset.id,
                    assetType: asset.assetType,
                    playerId: asset.playerId,
                    fromTeamId: asset.fromTeamId,
                    toTeamId: asset.toTeamId,
                  },
                  before: {
                    teamId: asset.fromTeamId,
                    status: hydratedProposal.status,
                  },
                  after: {
                    teamId: asset.toTeamId,
                    status: "PROCESSED",
                  },
                },
                metadata: {
                  teamNameFrom: teamNameById.get(asset.fromTeamId) ?? null,
                  teamNameTo: teamNameById.get(asset.toTeamId) ?? null,
                },
              }),
            ]);
            continue;
          }

          if (asset.assetType === "PICK" && asset.futurePickId) {
            const updated = await tx.futurePick.updateMany({
              where: {
                id: asset.futurePickId,
                leagueId: hydratedProposal.leagueId,
                currentTeamId: asset.fromTeamId,
              },
              data: {
                currentTeamId: asset.toTeamId,
              },
            });

            if (updated.count < 1) {
              throw new Error(
                `Unable to transfer pick ${asset.futurePickId}: fromTeam ownership check failed.`,
              );
            }

            await logTransaction(tx, {
              leagueId: hydratedProposal.leagueId,
              seasonId: hydratedProposal.seasonId,
              teamId: asset.toTeamId,
              type: TransactionType.PICK_TRANSFER,
              summary: `Received traded pick from ${
                teamNameById.get(asset.fromTeamId) ?? "sending team"
              }.`,
              audit: {
                actor: auditActorFromRequestActor(input.actor),
                source: "tradeProposalSettlementService.settle",
                entities: {
                  tradeProposalId: hydratedProposal.id,
                  tradeId: hydratedProposal.id,
                  assetId: asset.id,
                  assetType: asset.assetType,
                  futurePickId: asset.futurePickId,
                  fromTeamId: asset.fromTeamId,
                  toTeamId: asset.toTeamId,
                },
                before: {
                  teamId: asset.fromTeamId,
                  status: hydratedProposal.status,
                },
                after: {
                  teamId: asset.toTeamId,
                  status: "PROCESSED",
                },
              },
              metadata: {
                teamNameFrom: teamNameById.get(asset.fromTeamId) ?? null,
                teamNameTo: teamNameById.get(asset.toTeamId) ?? null,
              },
            });
          }
        }

        const updatedProposal = await txProposalRepository.update(hydratedProposal.id, {
          status: "PROCESSED",
        });

        await logTransaction(tx, {
          leagueId: hydratedProposal.leagueId,
          seasonId: hydratedProposal.seasonId,
          type: TransactionType.COMMISSIONER_OVERRIDE,
          summary: `Settled trade proposal between ${updatedProposal.proposerTeam.name} and ${updatedProposal.counterpartyTeam.name}.`,
          audit: {
            actor: auditActorFromRequestActor(input.actor),
            source: "tradeProposalSettlementService.settle",
            entities: {
              tradeProposalId: updatedProposal.id,
              tradeId: updatedProposal.id,
              proposerTeamId: updatedProposal.proposerTeam.id,
              counterpartyTeamId: updatedProposal.counterpartyTeam.id,
              assetCount: updatedProposal.assets.length,
            },
            before: {
              status: hydratedProposal.status,
            },
            after: {
              status: updatedProposal.status,
            },
          },
          metadata: {
            evaluationOutcome: evaluation.outcome,
            findingsCount: evaluation.findings.length,
            trigger: evaluation.trigger,
          },
        });

        return {
          proposalId: updatedProposal.id,
          status: updatedProposal.status,
        };
      }, TRADE_SETTLEMENT_TRANSACTION_OPTIONS);
    },
  };
}
