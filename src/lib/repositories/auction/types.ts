import type {
  AcquisitionType,
  AuctionAwardStatus,
  AuctionBidStatus,
  AuctionBidType,
  AuctionPoolExclusionReason,
  AuctionPlayerPoolEntryStatus,
  Prisma,
  PrismaClient,
} from "@prisma/client";

export type AuctionRepositoriesDbClient = PrismaClient | Prisma.TransactionClient;

export type AuctionPlayerPoolEntryWriteInput = {
  leagueId: string;
  seasonId: string;
  playerId: string;
  nominatedByTeamId?: string | null;
  openedByUserId?: string | null;
  status?: AuctionPlayerPoolEntryStatus;
  blindEligibleAt?: Date | null;
  blindConvertedAt?: Date | null;
  openBiddingOpenedAt?: Date | null;
  openBidClosesAt?: Date | null;
  blindBiddingOpenedAt?: Date | null;
  blindBidClosesAt?: Date | null;
  currentLeadingBidAmount?: number | null;
  currentLeadingTeamId?: string | null;
  awardedAt?: Date | null;
};

export type AuctionPlayerPoolEntryUpdateInput = {
  nominatedByTeamId?: string | null;
  openedByUserId?: string | null;
  status?: AuctionPlayerPoolEntryStatus;
  blindEligibleAt?: Date | null;
  blindConvertedAt?: Date | null;
  openBiddingOpenedAt?: Date | null;
  openBidClosesAt?: Date | null;
  blindBiddingOpenedAt?: Date | null;
  blindBidClosesAt?: Date | null;
  currentLeadingBidAmount?: number | null;
  currentLeadingTeamId?: string | null;
  awardedAt?: Date | null;
};

export type AuctionPlayerPoolExclusionWriteInput = {
  leagueId: string;
  seasonId: string;
  playerId: string;
  reason: AuctionPoolExclusionReason;
  reasonDetailsJson?: Prisma.InputJsonValue | null;
};

export type CreateAuctionBidInput = {
  draftId: string;
  leagueId: string;
  seasonId: string;
  poolEntryId: string;
  biddingTeamId: string;
  bidderUserId?: string | null;
  bidType: AuctionBidType;
  salaryAmount: number;
  contractYears: number;
  status?: AuctionBidStatus;
  submittedAt?: Date;
};

export type UpdateAuctionBidInput = {
  biddingTeamId?: string;
  bidderUserId?: string | null;
  bidType?: AuctionBidType;
  salaryAmount?: number;
  contractYears?: number;
  status?: AuctionBidStatus;
  submittedAt?: Date;
};

export type CreateAuctionAwardInput = {
  draftId: string;
  leagueId: string;
  seasonId: string;
  poolEntryId: string;
  winningBidId?: string | null;
  awardedTeamId: string;
  playerId: string;
  contractId?: string | null;
  rosterAssignmentId?: string | null;
  salaryAmount: number;
  contractYears: number;
  acquisitionType?: AcquisitionType;
  status?: AuctionAwardStatus;
  createdByUserId?: string | null;
  awardedAt?: Date;
};

export type UpdateAuctionAwardInput = {
  winningBidId?: string | null;
  awardedTeamId?: string;
  playerId?: string;
  contractId?: string | null;
  rosterAssignmentId?: string | null;
  salaryAmount?: number;
  contractYears?: number;
  acquisitionType?: AcquisitionType;
  status?: AuctionAwardStatus;
  createdByUserId?: string | null;
  awardedAt?: Date;
};
