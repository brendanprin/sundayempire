import { DraftPickStatus, Prisma, PrismaClient } from "@prisma/client";

export type DraftDbClient = PrismaClient | Prisma.TransactionClient;

export type DraftWarning = {
  code: string;
  message: string;
};

export const DEFAULT_ROOKIE_DRAFT_ROUNDS = [1, 2] as const;
export const ROOKIE_ELIGIBLE_YEARS_PRO = 0;

export function buildDefaultRookieDraftTitle(seasonYear: number) {
  return `${seasonYear} Rookie Draft`;
}

export function isRookieEligibleYearsPro(yearsPro: number | null | undefined) {
  return yearsPro === ROOKIE_ELIGIBLE_YEARS_PRO;
}

export function isResolvedDraftPickStatus(status: DraftPickStatus) {
  return status !== DraftPickStatus.PENDING;
}

export function deriveRookieOrderWarningKey(round: number) {
  return `ROOKIE_ORDER_ESTIMATED_ROUND_${round}`;
}
