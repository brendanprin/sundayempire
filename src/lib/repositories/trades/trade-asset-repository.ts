import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  TradeAssetParentIntent,
  TradeAssetWriteInput,
  TradesRepositoryDbClient,
} from "@/lib/repositories/trades/types";

export const tradeAssetInclude = Prisma.validator<Prisma.TradeAssetInclude>()({
  player: {
    select: {
      id: true,
      name: true,
      position: true,
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
    },
  },
});

export type TradeAssetRecord = Prisma.TradeAssetGetPayload<{
  include: typeof tradeAssetInclude;
}>;

export function assertTradeAssetParentIntent(input: TradeAssetParentIntent) {
  const hasLegacyTrade = typeof input.tradeId === "string" && input.tradeId.length > 0;
  const hasProposal = typeof input.tradeProposalId === "string" && input.tradeProposalId.length > 0;

  if (hasLegacyTrade === hasProposal) {
    throw new Error(
      "TradeAsset parent intent must provide exactly one of tradeId or tradeProposalId.",
    );
  }
}

function toCreateManyRow(
  parent: TradeAssetParentIntent,
  asset: TradeAssetWriteInput,
): Prisma.TradeAssetCreateManyInput {
  assertTradeAssetParentIntent(parent);

  return {
    tradeId: parent.tradeId ?? null,
    tradeProposalId: parent.tradeProposalId ?? null,
    fromTeamId: asset.fromTeamId,
    toTeamId: asset.toTeamId,
    assetType: asset.assetType,
    playerId: asset.playerId ?? null,
    futurePickId: asset.futurePickId ?? null,
    contractId: asset.contractId ?? null,
    assetOrder: asset.assetOrder ?? 0,
    snapshotLabel: asset.snapshotLabel ?? null,
  };
}

export function createTradeAssetRepository(
  client: TradesRepositoryDbClient = prisma,
) {
  return {
    async createManyForLegacyTrade(input: {
      tradeId: string;
      assets: TradeAssetWriteInput[];
    }) {
      assertTradeAssetParentIntent({ tradeId: input.tradeId });

      if (input.assets.length === 0) {
        return { count: 0 };
      }

      return client.tradeAsset.createMany({
        data: input.assets.map((asset) => toCreateManyRow({ tradeId: input.tradeId }, asset)),
      });
    },

    async replaceForTradeProposal(input: {
      tradeProposalId: string;
      assets: TradeAssetWriteInput[];
    }) {
      assertTradeAssetParentIntent({ tradeProposalId: input.tradeProposalId });

      await client.tradeAsset.deleteMany({
        where: {
          tradeProposalId: input.tradeProposalId,
        },
      });

      if (input.assets.length === 0) {
        return { count: 0 };
      }

      return client.tradeAsset.createMany({
        data: input.assets.map((asset) =>
          toCreateManyRow({ tradeProposalId: input.tradeProposalId }, asset),
        ),
      });
    },

    listForLegacyTrade(tradeId: string) {
      return client.tradeAsset.findMany({
        where: {
          tradeId,
        },
        include: tradeAssetInclude,
        orderBy: [{ assetOrder: "asc" }, { createdAt: "asc" }],
      });
    },

    listForTradeProposal(tradeProposalId: string) {
      return client.tradeAsset.findMany({
        where: {
          tradeProposalId,
        },
        include: tradeAssetInclude,
        orderBy: [{ assetOrder: "asc" }, { createdAt: "asc" }],
      });
    },
  };
}
