import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AuctionRepositoriesDbClient,
  CreateAuctionBidInput,
  UpdateAuctionBidInput,
} from "@/lib/repositories/auction/types";

export const auctionBidInclude = Prisma.validator<Prisma.AuctionBidInclude>()({
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
  poolEntry: {
    select: {
      id: true,
      status: true,
      currentLeadingBidAmount: true,
      player: {
        select: {
          id: true,
          name: true,
          position: true,
          nflTeam: true,
        },
      },
    },
  },
  biddingTeam: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  bidderUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
});

export type AuctionBidRecord = Prisma.AuctionBidGetPayload<{
  include: typeof auctionBidInclude;
}>;

export function createAuctionBidRepository(client: AuctionRepositoriesDbClient = prisma) {
  return {
    create(input: CreateAuctionBidInput) {
      return client.auctionBid.create({
        data: {
          draftId: input.draftId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          poolEntryId: input.poolEntryId,
          biddingTeamId: input.biddingTeamId,
          bidderUserId: input.bidderUserId ?? null,
          bidType: input.bidType,
          salaryAmount: input.salaryAmount,
          contractYears: input.contractYears,
          status: input.status ?? "ACTIVE",
          submittedAt: input.submittedAt ?? new Date(),
        },
        include: auctionBidInclude,
      });
    },

    findById(auctionBidId: string) {
      return client.auctionBid.findUnique({
        where: {
          id: auctionBidId,
        },
        include: auctionBidInclude,
      });
    },

    listForDraft(draftId: string) {
      return client.auctionBid.findMany({
        where: {
          draftId,
        },
        include: auctionBidInclude,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      });
    },

    listForPoolEntry(poolEntryId: string) {
      return client.auctionBid.findMany({
        where: {
          poolEntryId,
        },
        include: auctionBidInclude,
        orderBy: [{ submittedAt: "desc" }, { id: "desc" }],
      });
    },

    update(auctionBidId: string, input: UpdateAuctionBidInput) {
      return client.auctionBid.update({
        where: {
          id: auctionBidId,
        },
        data: {
          biddingTeamId: input.biddingTeamId,
          bidderUserId: input.bidderUserId,
          bidType: input.bidType,
          salaryAmount: input.salaryAmount,
          contractYears: input.contractYears,
          status: input.status,
          submittedAt: input.submittedAt,
        },
        include: auctionBidInclude,
      });
    },
  };
}
