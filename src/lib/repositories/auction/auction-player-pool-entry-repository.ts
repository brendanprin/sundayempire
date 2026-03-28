import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AuctionPlayerPoolEntryUpdateInput,
  AuctionPlayerPoolEntryWriteInput,
  AuctionRepositoriesDbClient,
} from "@/lib/repositories/auction/types";

export const auctionPlayerPoolEntryInclude =
  Prisma.validator<Prisma.AuctionPlayerPoolEntryInclude>()({
    draft: {
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        auctionMode: true,
        auctionEndsAt: true,
      },
    },
    player: {
      select: {
        id: true,
        name: true,
        position: true,
        nflTeam: true,
        isRestricted: true,
      },
    },
    nominatedByTeam: {
      select: {
        id: true,
        name: true,
        abbreviation: true,
      },
    },
    openedByUser: {
      select: {
        id: true,
        email: true,
        name: true,
      },
    },
    currentLeadingTeam: {
      select: {
        id: true,
        name: true,
        abbreviation: true,
      },
    },
    award: {
      select: {
        id: true,
        status: true,
        winningBidId: true,
        awardedTeamId: true,
        awardedAt: true,
      },
    },
  });

export type AuctionPlayerPoolEntryRecord = Prisma.AuctionPlayerPoolEntryGetPayload<{
  include: typeof auctionPlayerPoolEntryInclude;
}>;

function toCreateManyRow(
  draftId: string,
  entry: AuctionPlayerPoolEntryWriteInput,
): Prisma.AuctionPlayerPoolEntryCreateManyInput {
  return {
    draftId,
    leagueId: entry.leagueId,
    seasonId: entry.seasonId,
    playerId: entry.playerId,
    nominatedByTeamId: entry.nominatedByTeamId ?? null,
    openedByUserId: entry.openedByUserId ?? null,
    status: entry.status ?? "ELIGIBLE",
    blindEligibleAt: entry.blindEligibleAt ?? null,
    blindConvertedAt: entry.blindConvertedAt ?? null,
    openBiddingOpenedAt: entry.openBiddingOpenedAt ?? null,
    openBidClosesAt: entry.openBidClosesAt ?? null,
    blindBiddingOpenedAt: entry.blindBiddingOpenedAt ?? null,
    blindBidClosesAt: entry.blindBidClosesAt ?? null,
    currentLeadingBidAmount: entry.currentLeadingBidAmount ?? null,
    currentLeadingTeamId: entry.currentLeadingTeamId ?? null,
    awardedAt: entry.awardedAt ?? null,
    // New constitutional alignment fields
    blindEligibleTeamIds: null,
    leadHistoryJson: null,
    reopenedAt: null,
    reopenedByUserId: null,
    reopenReason: null,
    previousStatus: null,
  };
}

export function createAuctionPlayerPoolEntryRepository(
  client: AuctionRepositoriesDbClient = prisma,
) {
  return {
    async replaceForDraft(input: {
      draftId: string;
      entries: AuctionPlayerPoolEntryWriteInput[];
    }) {
      await client.auctionPlayerPoolEntry.deleteMany({
        where: {
          draftId: input.draftId,
        },
      });

      if (input.entries.length === 0) {
        return { count: 0 };
      }

      return client.auctionPlayerPoolEntry.createMany({
        data: input.entries.map((entry) => toCreateManyRow(input.draftId, entry)),
      });
    },

    create(input: { draftId: string; entry: AuctionPlayerPoolEntryWriteInput }) {
      return client.auctionPlayerPoolEntry.create({
        data: toCreateManyRow(input.draftId, input.entry),
        include: auctionPlayerPoolEntryInclude,
      });
    },

    findById(poolEntryId: string) {
      return client.auctionPlayerPoolEntry.findUnique({
        where: {
          id: poolEntryId,
        },
        include: auctionPlayerPoolEntryInclude,
      });
    },

    findByPlayer(input: { draftId: string; playerId: string }) {
      return client.auctionPlayerPoolEntry.findFirst({
        where: {
          draftId: input.draftId,
          playerId: input.playerId,
        },
        include: auctionPlayerPoolEntryInclude,
      });
    },

    listForDraft(draftId: string) {
      return client.auctionPlayerPoolEntry.findMany({
        where: {
          draftId,
        },
        include: auctionPlayerPoolEntryInclude,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      });
    },

    update(poolEntryId: string, input: AuctionPlayerPoolEntryUpdateInput) {
      return client.auctionPlayerPoolEntry.update({
        where: {
          id: poolEntryId,
        },
        data: {
          nominatedByTeamId: input.nominatedByTeamId,
          openedByUserId: input.openedByUserId,
          status: input.status,
          blindEligibleAt: input.blindEligibleAt,
          blindConvertedAt: input.blindConvertedAt,
          openBiddingOpenedAt: input.openBiddingOpenedAt,
          openBidClosesAt: input.openBidClosesAt,
          blindBiddingOpenedAt: input.blindBiddingOpenedAt,
          blindBidClosesAt: input.blindBidClosesAt,
          currentLeadingBidAmount: input.currentLeadingBidAmount,
          currentLeadingTeamId: input.currentLeadingTeamId,
          awardedAt: input.awardedAt,
        },
        include: auctionPlayerPoolEntryInclude,
      });
    },
  };
}
