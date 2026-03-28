import type {
  DraftOrderSourceType,
  DraftPickStatus,
  DraftSelectionOutcome,
  Prisma,
  PrismaClient,
} from "@prisma/client";

export type DraftsRepositoryDbClient = PrismaClient | Prisma.TransactionClient;

export type DraftOrderEntryWriteInput = {
  seasonId: string;
  pickNumber: number;
  round: number;
  sourceType: DraftOrderSourceType;
  futurePickId?: string | null;
  originalTeamId?: string | null;
  owningTeamId: string;
  selectingTeamId: string;
  isBonus?: boolean;
  isManualOverride?: boolean;
  overrideReason?: string | null;
  createdByUserId?: string | null;
};

export type DraftOrderEntryUpdateInput = {
  futurePickId?: string | null;
  originalTeamId?: string | null;
  owningTeamId?: string;
  selectingTeamId?: string;
  sourceType?: DraftOrderSourceType;
  isBonus?: boolean;
  isManualOverride?: boolean;
  overrideReason?: string | null;
  createdByUserId?: string | null;
};

export type DraftPickWriteInput = {
  seasonId: string;
  draftOrderEntryId: string;
  futurePickId?: string | null;
  selectingTeamId: string;
  pickNumber: number;
  round: number;
  status?: DraftPickStatus;
  openedAt?: Date | null;
  resolvedAt?: Date | null;
};

export type DraftPickUpdateInput = {
  futurePickId?: string | null;
  selectingTeamId?: string;
  status?: DraftPickStatus;
  openedAt?: Date | null;
  resolvedAt?: Date | null;
};

export type CreateDraftSelectionInput = {
  draftId: string;
  draftPickId?: string | null;
  pickId?: string | null;
  selectingTeamId: string;
  playerId?: string | null;
  actedByUserId?: string | null;
  contractId?: string | null;
  rosterAssignmentId?: string | null;
  round: number;
  pickNumber: number;
  salary?: number | null;
  contractYears?: number | null;
  outcome?: DraftSelectionOutcome;
  isPassed?: boolean;
  madeAt?: Date | null;
};

export type UpdateDraftSelectionInput = {
  draftPickId?: string | null;
  pickId?: string | null;
  selectingTeamId?: string;
  playerId?: string | null;
  actedByUserId?: string | null;
  contractId?: string | null;
  rosterAssignmentId?: string | null;
  salary?: number | null;
  contractYears?: number | null;
  outcome?: DraftSelectionOutcome;
  isPassed?: boolean;
  madeAt?: Date | null;
};
