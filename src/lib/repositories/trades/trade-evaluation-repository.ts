import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateTradeEvaluationInput,
  TradesRepositoryDbClient,
} from "@/lib/repositories/trades/types";

export const tradeEvaluationInclude = Prisma.validator<Prisma.TradeEvaluationInclude>()({
  createdByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
});

export type TradeEvaluationRecord = Prisma.TradeEvaluationGetPayload<{
  include: typeof tradeEvaluationInclude;
}>;

export function createTradeEvaluationRepository(
  client: TradesRepositoryDbClient = prisma,
) {
  return {
    create(input: CreateTradeEvaluationInput) {
      return client.tradeEvaluation.create({
        data: {
          proposalId: input.proposalId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          createdByUserId: input.createdByUserId ?? null,
          trigger: input.trigger,
          outcome: input.outcome,
          isCurrent: input.isCurrent ?? true,
          isSubmissionSnapshot: input.isSubmissionSnapshot ?? false,
          assetFingerprint: input.assetFingerprint,
          findingsJson: input.findingsJson,
          remediationJson:
            input.remediationJson === undefined
              ? undefined
              : input.remediationJson ?? Prisma.DbNull,
          postTradeProjectionJson: input.postTradeProjectionJson,
          evaluatedAt: input.evaluatedAt ?? new Date(),
        },
        include: tradeEvaluationInclude,
      });
    },

    markAllNotCurrent(proposalId: string) {
      return client.tradeEvaluation.updateMany({
        where: {
          proposalId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });
    },

    findCurrentForProposal(proposalId: string) {
      return client.tradeEvaluation.findFirst({
        where: {
          proposalId,
          isCurrent: true,
        },
        include: tradeEvaluationInclude,
        orderBy: [{ evaluatedAt: "desc" }, { createdAt: "desc" }],
      });
    },

    listForProposal(proposalId: string) {
      return client.tradeEvaluation.findMany({
        where: {
          proposalId,
        },
        include: tradeEvaluationInclude,
        orderBy: [{ evaluatedAt: "desc" }, { createdAt: "desc" }],
      });
    },
  };
}
