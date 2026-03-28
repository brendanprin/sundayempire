import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTradeProposalRepository } from "@/lib/repositories/trades/trade-proposal-repository";
import {
  findCurrentEvaluation,
  isTradeProposalReadyToSettle,
  mapTradeAssetView,
  mapTradeEvaluationView,
} from "@/lib/read-models/trades/shared";
import type { TradeProposalDetailResponse } from "@/types/trade-workflow";

type TradesReadDbClient = PrismaClient | Prisma.TransactionClient;

export function createTradeProposalDetailProjection(
  client: TradesReadDbClient = prisma,
) {
  const proposalRepository = createTradeProposalRepository(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      seasonPhase: string;
      leagueName: string;
      actor: AuthActor;
      proposalId: string;
    }): Promise<TradeProposalDetailResponse | null> {
      const proposal = await proposalRepository.findById(input.proposalId);
      if (!proposal || proposal.leagueId !== input.leagueId || proposal.seasonId !== input.seasonId) {
        return null;
      }

      const canView =
        input.actor.leagueRole === "COMMISSIONER" ||
        !input.actor.teamId ||
        input.actor.teamId === proposal.proposerTeamId ||
        input.actor.teamId === proposal.counterpartyTeamId;
      if (!canView) {
        return null;
      }

      const currentEvaluation = findCurrentEvaluation(proposal);
      return {
        viewer: {
          leagueRole: input.actor.leagueRole,
          hasTeamAccess: Boolean(input.actor.teamId),
          teamId: input.actor.teamId,
          teamName: input.actor.teamName,
        },
        league: {
          id: input.leagueId,
          name: input.leagueName,
        },
        season: {
          id: input.seasonId,
          year: input.seasonYear,
          phase: input.seasonPhase,
        },
        proposal: {
          id: proposal.id,
          status: proposal.status,
          proposerTeam: {
            id: proposal.proposerTeam.id,
            name: proposal.proposerTeam.name,
            abbreviation: proposal.proposerTeam.abbreviation,
          },
          counterpartyTeam: {
            id: proposal.counterpartyTeam.id,
            name: proposal.counterpartyTeam.name,
            abbreviation: proposal.counterpartyTeam.abbreviation,
          },
          createdAt: proposal.createdAt.toISOString(),
          updatedAt: proposal.updatedAt.toISOString(),
          submittedAt: proposal.submittedAt?.toISOString() ?? null,
          counterpartyRespondedAt: proposal.counterpartyRespondedAt?.toISOString() ?? null,
          reviewedAt: proposal.reviewedAt?.toISOString() ?? null,
          assets: proposal.assets.map(mapTradeAssetView),
        },
        currentEvaluation: currentEvaluation ? mapTradeEvaluationView(currentEvaluation) : null,
        evaluationHistory: proposal.evaluations.map(mapTradeEvaluationView),
        permissions: {
          canEditDraft:
            proposal.status === "DRAFT" &&
            (input.actor.leagueRole === "COMMISSIONER" ||
              (input.actor.leagueRole === "MEMBER" &&
                input.actor.teamId === proposal.proposerTeamId)),
          canSubmit:
            proposal.status === "DRAFT" &&
            (input.actor.leagueRole === "COMMISSIONER" ||
              (input.actor.leagueRole === "MEMBER" &&
                input.actor.teamId === proposal.proposerTeamId)),
          canAccept:
            proposal.status === "SUBMITTED" &&
            (input.actor.leagueRole === "COMMISSIONER" ||
              (input.actor.leagueRole === "MEMBER" &&
                input.actor.teamId === proposal.counterpartyTeamId)),
          canDecline:
            proposal.status === "SUBMITTED" &&
            (input.actor.leagueRole === "COMMISSIONER" ||
              (input.actor.leagueRole === "MEMBER" &&
                input.actor.teamId === proposal.counterpartyTeamId)),
          canCommissionerReview:
            input.actor.leagueRole === "COMMISSIONER" && proposal.status === "REVIEW_PENDING",
          canProcess:
            input.actor.leagueRole === "COMMISSIONER" &&
            isTradeProposalReadyToSettle(proposal.status),
        },
      };
    },
  };
}
