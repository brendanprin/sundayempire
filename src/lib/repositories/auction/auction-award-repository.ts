import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AuctionRepositoriesDbClient,
  CreateAuctionAwardInput,
  UpdateAuctionAwardInput,
} from "@/lib/repositories/auction/types";

export const auctionAwardInclude = Prisma.validator<Prisma.AuctionAwardInclude>()({
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
  winningBid: {
    select: {
      id: true,
      bidType: true,
      salaryAmount: true,
      contractYears: true,
      status: true,
      submittedAt: true,
      biddingTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      },
    },
  },
  awardedTeam: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  player: {
    select: {
      id: true,
      name: true,
      position: true,
      nflTeam: true,
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
  rosterAssignment: {
    select: {
      id: true,
      teamId: true,
      playerId: true,
      contractId: true,
      acquisitionType: true,
      rosterStatus: true,
      effectiveAt: true,
      endedAt: true,
    },
  },
  createdByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
});

export type AuctionAwardRecord = Prisma.AuctionAwardGetPayload<{
  include: typeof auctionAwardInclude;
}>;

export function createAuctionAwardRepository(client: AuctionRepositoriesDbClient = prisma) {
  return {
    create(input: CreateAuctionAwardInput) {
      return client.auctionAward.create({
        data: {
          draftId: input.draftId,
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          poolEntryId: input.poolEntryId,
          winningBidId: input.winningBidId ?? null,
          awardedTeamId: input.awardedTeamId,
          playerId: input.playerId,
          contractId: input.contractId ?? null,
          rosterAssignmentId: input.rosterAssignmentId ?? null,
          salaryAmount: input.salaryAmount,
          contractYears: input.contractYears,
          acquisitionType: input.acquisitionType ?? "AUCTION",
          status: input.status ?? "FINALIZED",
          createdByUserId: input.createdByUserId ?? null,
          awardedAt: input.awardedAt ?? new Date(),
        },
        include: auctionAwardInclude,
      });
    },

    findById(auctionAwardId: string) {
      return client.auctionAward.findUnique({
        where: {
          id: auctionAwardId,
        },
        include: auctionAwardInclude,
      });
    },

    findByPoolEntry(poolEntryId: string) {
      return client.auctionAward.findUnique({
        where: {
          poolEntryId,
        },
        include: auctionAwardInclude,
      });
    },

    listForDraft(draftId: string) {
      return client.auctionAward.findMany({
        where: {
          draftId,
        },
        include: auctionAwardInclude,
        orderBy: [{ awardedAt: "desc" }, { id: "desc" }],
      });
    },

    update(auctionAwardId: string, input: UpdateAuctionAwardInput) {
      return client.auctionAward.update({
        where: {
          id: auctionAwardId,
        },
        data: {
          winningBidId: input.winningBidId,
          awardedTeamId: input.awardedTeamId,
          playerId: input.playerId,
          contractId: input.contractId,
          rosterAssignmentId: input.rosterAssignmentId,
          salaryAmount: input.salaryAmount,
          contractYears: input.contractYears,
          acquisitionType: input.acquisitionType,
          status: input.status,
          createdByUserId: input.createdByUserId,
          awardedAt: input.awardedAt,
        },
        include: auctionAwardInclude,
      });
    },
  };
}
