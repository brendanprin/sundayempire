import type {
  PlayerRefreshChangeReviewStatus,
  PlayerRefreshChangeType,
  PlayerRefreshJobStatus,
  PlayerRefreshTriggerType,
  Position,
  Prisma,
  PrismaClient,
} from "@prisma/client";

export type PlayerRepositoriesDbClient = PrismaClient | Prisma.TransactionClient;

export type CreatePlayerRefreshJobInput = {
  requestedByUserId?: string | null;
  triggerType?: PlayerRefreshTriggerType;
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

export type CreatePlayerRefreshChangeInput = {
  jobId: string;
  playerId?: string | null;
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

// Re-exported for backwards compatibility with position-related code
export type { Position };
