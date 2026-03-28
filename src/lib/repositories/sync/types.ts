import type {
  HostPlatformSyncJobStatus,
  HostPlatformSyncJobType,
  HostPlatformSyncTrigger,
  Prisma,
  PrismaClient,
  SyncMismatchResolutionType,
  SyncMismatchSeverity,
  SyncMismatchStatus,
  SyncMismatchType,
} from "@prisma/client";

export type SyncRepositoriesDbClient = PrismaClient | Prisma.TransactionClient;

export type CreateHostPlatformSyncJobInput = {
  leagueId: string;
  seasonId: string;
  requestedByUserId?: string | null;
  jobType: HostPlatformSyncJobType;
  status?: HostPlatformSyncJobStatus;
  trigger: HostPlatformSyncTrigger;
  adapterKey: string;
  sourceLabel?: string | null;
  sourceSnapshotAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  payloadDigest?: string | null;
  inputJson?: Prisma.InputJsonValue | null;
  summaryJson?: Prisma.InputJsonValue | null;
  errorJson?: Prisma.InputJsonValue | null;
};

export type UpdateHostPlatformSyncJobInput = {
  requestedByUserId?: string | null;
  status?: HostPlatformSyncJobStatus;
  trigger?: HostPlatformSyncTrigger;
  adapterKey?: string;
  sourceLabel?: string | null;
  sourceSnapshotAt?: Date | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  payloadDigest?: string | null;
  inputJson?: Prisma.InputJsonValue | null;
  summaryJson?: Prisma.InputJsonValue | null;
  errorJson?: Prisma.InputJsonValue | null;
};

export type CreateSyncMismatchInput = {
  leagueId: string;
  seasonId: string;
  jobId: string;
  teamId?: string | null;
  playerId?: string | null;
  rosterAssignmentId?: string | null;
  complianceIssueId?: string | null;
  mismatchType: SyncMismatchType;
  severity: SyncMismatchSeverity;
  status?: SyncMismatchStatus;
  resolutionType?: SyncMismatchResolutionType | null;
  fingerprint: string;
  title: string;
  message: string;
  hostPlatformReferenceId?: string | null;
  hostValueJson?: Prisma.InputJsonValue | null;
  dynastyValueJson?: Prisma.InputJsonValue | null;
  metadataJson?: Prisma.InputJsonValue | null;
  detectionCount?: number;
  firstDetectedAt?: Date;
  lastDetectedAt?: Date;
  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;
  resolutionReason?: string | null;
};

export type UpdateSyncMismatchInput = {
  teamId?: string | null;
  playerId?: string | null;
  rosterAssignmentId?: string | null;
  complianceIssueId?: string | null;
  mismatchType?: SyncMismatchType;
  severity?: SyncMismatchSeverity;
  status?: SyncMismatchStatus;
  resolutionType?: SyncMismatchResolutionType | null;
  fingerprint?: string;
  title?: string;
  message?: string;
  hostPlatformReferenceId?: string | null;
  hostValueJson?: Prisma.InputJsonValue | null;
  dynastyValueJson?: Prisma.InputJsonValue | null;
  metadataJson?: Prisma.InputJsonValue | null;
  detectionCount?: number;
  firstDetectedAt?: Date;
  lastDetectedAt?: Date;
  resolvedAt?: Date | null;
  resolvedByUserId?: string | null;
  resolutionReason?: string | null;
};
