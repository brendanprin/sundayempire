import type {
  PlayerRefreshChangeReviewStatus,
  PlayerRefreshChangeType,
  PlayerRefreshJobStatus,
  Position,
  Prisma,
  PrismaClient,
} from "@prisma/client";

export type PlayerRepositoriesDbClient = PrismaClient | Prisma.TransactionClient;

export type CreatePlayerRefreshJobInput = {
  leagueId: string;
  seasonId: string;
  requestedByUserId?: string | null;
  adapterKey: string;
  sourceLabel?: string | null;
  status?: PlayerRefreshJobStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  payloadDigest?: string | null;
  inputJson?: Prisma.InputJsonValue | null;
  summaryJson?: Prisma.InputJsonValue | null;
  errorJson?: Prisma.InputJsonValue | null;
};

export type UpdatePlayerRefreshJobInput = {
  requestedByUserId?: string | null;
  adapterKey?: string;
  sourceLabel?: string | null;
  status?: PlayerRefreshJobStatus;
  startedAt?: Date | null;
  completedAt?: Date | null;
  payloadDigest?: string | null;
  inputJson?: Prisma.InputJsonValue | null;
  summaryJson?: Prisma.InputJsonValue | null;
  errorJson?: Prisma.InputJsonValue | null;
};

export type CreatePlayerSeasonSnapshotInput = {
  playerId: string;
  leagueId: string;
  seasonId: string;
  refreshJobId?: string | null;
  sourceKey?: string | null;
  sourcePlayerId?: string | null;
  externalId?: string | null;
  name: string;
  displayName: string;
  searchName: string;
  position: Position;
  nflTeam?: string | null;
  age?: number | null;
  yearsPro?: number | null;
  injuryStatus?: string | null;
  statusCode?: string | null;
  statusText?: string | null;
  isRestricted?: boolean;
  capturedAt?: Date;
};

export type CreatePlayerRefreshChangeInput = {
  leagueId: string;
  seasonId: string;
  jobId: string;
  playerId?: string | null;
  snapshotId?: string | null;
  changeType: PlayerRefreshChangeType;
  reviewStatus?: PlayerRefreshChangeReviewStatus;
  fieldMaskJson?: Prisma.InputJsonValue | null;
  previousValuesJson?: Prisma.InputJsonValue | null;
  incomingValuesJson?: Prisma.InputJsonValue | null;
  appliedValuesJson?: Prisma.InputJsonValue | null;
  notes?: string | null;
  reviewedAt?: Date | null;
  reviewedByUserId?: string | null;
};

export type CreatePlayerIdentityMappingInput = {
  playerId: string;
  sourceKey: string;
  sourcePlayerId: string;
  approvedByUserId?: string | null;
  notes?: string | null;
  approvedAt?: Date | null;
};

export type UpdatePlayerIdentityMappingInput = {
  playerId?: string;
  sourceKey?: string;
  sourcePlayerId?: string;
  approvedByUserId?: string | null;
  notes?: string | null;
  approvedAt?: Date | null;
};

export type UpdatePlayerRefreshChangeInput = {
  playerId?: string | null;
  snapshotId?: string | null;
  changeType?: PlayerRefreshChangeType;
  reviewStatus?: PlayerRefreshChangeReviewStatus;
  fieldMaskJson?: Prisma.InputJsonValue | null;
  previousValuesJson?: Prisma.InputJsonValue | null;
  incomingValuesJson?: Prisma.InputJsonValue | null;
  appliedValuesJson?: Prisma.InputJsonValue | null;
  notes?: string | null;
  reviewedAt?: Date | null;
  reviewedByUserId?: string | null;
};
