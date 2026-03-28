import { Prisma, type TradeProposalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { tradeEvaluationInclude } from "@/lib/repositories/trades/trade-evaluation-repository";
import type {
  CreateTradeProposalInput,
  TradesRepositoryDbClient,
  UpdateTradeProposalInput,
} from "@/lib/repositories/trades/types";

export const tradeProposalInclude = Prisma.validator<Prisma.TradeProposalInclude>()({
  createdByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  submittedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  respondedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  reviewedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
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
  assets: {
    include: {
      player: {
        select: {
          id: true,
          name: true,
          position: true,
          isRestricted: true,
        },
      },
      futurePick: {
        include: {
          originalTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          currentTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      },
      contract: {
            select: {
              id: true,
              teamId: true,
              playerId: true,
              salary: true,
              yearsRemaining: true,
              status: true,
              isFranchiseTag: true,
            },
          },
        },
    orderBy: [{ assetOrder: "asc" }, { createdAt: "asc" }],
  },
  evaluations: {
    include: tradeEvaluationInclude,
    orderBy: [{ evaluatedAt: "desc" }, { createdAt: "desc" }],
  },
});

export type TradeProposalRecord = Prisma.TradeProposalGetPayload<{
  include: typeof tradeProposalInclude;
}>;

export function createTradeProposalRepository(
  client: TradesRepositoryDbClient = prisma,
) {
  return {
    create(input: CreateTradeProposalInput) {
      return client.tradeProposal.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          proposerTeamId: input.proposerTeamId,
          counterpartyTeamId: input.counterpartyTeamId,
          createdByUserId: input.createdByUserId,
          submittedByUserId: input.submittedByUserId ?? null,
          counterpartyRespondedByUserId: input.counterpartyRespondedByUserId ?? null,
          reviewedByUserId: input.reviewedByUserId ?? null,
          status: input.status ?? "DRAFT",
          submittedAt: input.submittedAt ?? null,
          counterpartyRespondedAt: input.counterpartyRespondedAt ?? null,
          reviewedAt: input.reviewedAt ?? null,
        },
        include: tradeProposalInclude,
      });
    },

    findById(proposalId: string) {
      return client.tradeProposal.findUnique({
        where: {
          id: proposalId,
        },
        include: tradeProposalInclude,
      });
    },

    update(proposalId: string, input: UpdateTradeProposalInput) {
      return client.tradeProposal.update({
        where: {
          id: proposalId,
        },
        data: {
          proposerTeamId: input.proposerTeamId,
          counterpartyTeamId: input.counterpartyTeamId,
          submittedByUserId: input.submittedByUserId,
          counterpartyRespondedByUserId: input.counterpartyRespondedByUserId,
          reviewedByUserId: input.reviewedByUserId,
          status: input.status,
          submittedAt: input.submittedAt,
          counterpartyRespondedAt: input.counterpartyRespondedAt,
          reviewedAt: input.reviewedAt,
        },
        include: tradeProposalInclude,
      });
    },

    listBySeason(input: {
      leagueId: string;
      seasonId: string;
      teamId?: string | null;
      statuses?: TradeProposalStatus[];
    }) {
      return client.tradeProposal.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          ...(input.teamId
            ? {
                OR: [
                  { proposerTeamId: input.teamId },
                  { counterpartyTeamId: input.teamId },
                ],
              }
            : {}),
          ...(input.statuses && input.statuses.length > 0
            ? {
                status: {
                  in: input.statuses,
                },
              }
            : {}),
        },
        include: tradeProposalInclude,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      });
    },
  };
}
