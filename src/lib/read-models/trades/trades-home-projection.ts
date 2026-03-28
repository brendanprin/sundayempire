import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createTradeProposalRepository } from "@/lib/repositories/trades/trade-proposal-repository";
import {
  isTradeProposalClosed,
  isTradeProposalReadyToSettle,
  mapTradeProposalSummary,
  sortProposalSummariesByUpdatedAt,
} from "@/lib/read-models/trades/shared";
import type { TradeHomeResponse } from "@/types/trade-workflow";

type TradesReadDbClient = PrismaClient | Prisma.TransactionClient;

export function createTradesHomeProjection(client: TradesReadDbClient = prisma) {
  const proposalRepository = createTradeProposalRepository(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      seasonPhase: string;
      leagueName: string;
      actor: AuthActor;
    }): Promise<TradeHomeResponse> {
      const proposals = await proposalRepository.listBySeason({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
      });

      const mapped = proposals.map(mapTradeProposalSummary);
      const drafts = sortProposalSummariesByUpdatedAt(
        mapped.filter((proposal) => {
          if (proposal.status !== "DRAFT") {
            return false;
          }

          if (input.actor.leagueRole === "COMMISSIONER") {
            return true;
          }

          return input.actor.teamId === proposal.proposerTeam.id;
        }),
      );
      const requiresResponse = sortProposalSummariesByUpdatedAt(
        mapped.filter(
          (proposal) =>
            proposal.status === "SUBMITTED" &&
            (input.actor.leagueRole === "COMMISSIONER" ||
              input.actor.teamId === proposal.counterpartyTeam.id),
        ),
      );
      const outgoing = sortProposalSummariesByUpdatedAt(
        mapped.filter((proposal) => {
          if (input.actor.leagueRole === "COMMISSIONER") {
            return proposal.status === "SUBMITTED";
          }

          if (proposal.proposerTeam.id !== input.actor.teamId) {
            return false;
          }

          return (
            proposal.status === "SUBMITTED" ||
            proposal.status === "REVIEW_PENDING" ||
            isTradeProposalReadyToSettle(proposal.status)
          );
        }),
      );
      const reviewQueue = sortProposalSummariesByUpdatedAt(
        mapped.filter(
          (proposal) =>
            proposal.status === "REVIEW_PENDING" &&
            (input.actor.leagueRole === "COMMISSIONER" ||
              input.actor.teamId === proposal.proposerTeam.id ||
              input.actor.teamId === proposal.counterpartyTeam.id),
        ),
      );
      const settlementQueue = sortProposalSummariesByUpdatedAt(
        mapped.filter(
          (proposal) =>
            input.actor.leagueRole === "COMMISSIONER" &&
            isTradeProposalReadyToSettle(proposal.status),
        ),
      );
      const closed = sortProposalSummariesByUpdatedAt(
        mapped.filter((proposal) => isTradeProposalClosed(proposal.status)),
      ).slice(0, 15);

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
        summary: {
          drafts: drafts.length,
          requiresResponse: requiresResponse.length,
          outgoing: outgoing.length,
          reviewQueue: reviewQueue.length,
          settlementQueue: settlementQueue.length,
          closed: closed.length,
        },
        sections: {
          drafts,
          requiresResponse,
          outgoing,
          reviewQueue,
          settlementQueue,
          closed,
        },
      };
    },
  };
}
