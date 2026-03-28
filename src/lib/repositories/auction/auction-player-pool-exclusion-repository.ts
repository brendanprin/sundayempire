import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AuctionPlayerPoolExclusionWriteInput,
  AuctionRepositoriesDbClient,
} from "@/lib/repositories/auction/types";

export const auctionPlayerPoolExclusionInclude =
  Prisma.validator<Prisma.AuctionPlayerPoolExclusionInclude>()({
    draft: {
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        auctionMode: true,
      },
    },
    player: {
      select: {
        id: true,
        name: true,
        displayName: true,
        position: true,
        nflTeam: true,
        isRestricted: true,
      },
    },
  });

export type AuctionPlayerPoolExclusionRecord = Prisma.AuctionPlayerPoolExclusionGetPayload<{
  include: typeof auctionPlayerPoolExclusionInclude;
}>;

function nullableJson(
  value: Prisma.InputJsonValue | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value ?? Prisma.DbNull;
}

function toCreateManyRow(
  draftId: string,
  entry: AuctionPlayerPoolExclusionWriteInput,
): Prisma.AuctionPlayerPoolExclusionCreateManyInput {
  return {
    draftId,
    leagueId: entry.leagueId,
    seasonId: entry.seasonId,
    playerId: entry.playerId,
    reason: entry.reason,
    reasonDetailsJson: nullableJson(entry.reasonDetailsJson),
  };
}

export function createAuctionPlayerPoolExclusionRepository(
  client: AuctionRepositoriesDbClient = prisma,
) {
  return {
    async replaceForDraft(input: {
      draftId: string;
      entries: AuctionPlayerPoolExclusionWriteInput[];
    }) {
      await client.auctionPlayerPoolExclusion.deleteMany({
        where: {
          draftId: input.draftId,
        },
      });

      if (input.entries.length === 0) {
        return { count: 0 };
      }

      return client.auctionPlayerPoolExclusion.createMany({
        data: input.entries.map((entry) => toCreateManyRow(input.draftId, entry)),
      });
    },

    listForDraft(draftId: string) {
      return client.auctionPlayerPoolExclusion.findMany({
        where: {
          draftId,
        },
        include: auctionPlayerPoolExclusionInclude,
        orderBy: [{ createdAt: "asc" }],
      });
    },
  };
}
