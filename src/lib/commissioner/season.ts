import { LeaguePhase, TransactionType } from "@prisma/client";
import { CANONICAL_LEAGUE_PHASES, LEGACY_LEAGUE_PHASES, normalizeLeaguePhaseInput, toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

export const LEAGUE_PHASES = [...LEGACY_LEAGUE_PHASES, ...CANONICAL_LEAGUE_PHASES];

export function isLeaguePhase(value: unknown): boolean {
  return normalizeLeaguePhaseInput(value) !== null;
}

export async function transitionSeasonPhase(input: {
  leagueId: string;
  seasonId: string;
  nextPhase: LeaguePhase | string;
  actor?: string;
  initiatedByUserId?: string;
  initiatedByType?: string;
  reason?: string | null;
}) {
  const normalizedNextPhase = normalizeLeaguePhaseInput(input.nextPhase);
  if (!normalizedNextPhase) {
    throw new Error("INVALID_PHASE");
  }

  const season = await prisma.season.findFirst({
    where: {
      id: input.seasonId,
      leagueId: input.leagueId,
    },
  });

  if (!season) {
    throw new Error("SEASON_NOT_FOUND");
  }

  if (season.phase === normalizedNextPhase) {
    return {
      season: {
        ...season,
        phase: toLegacyLeaguePhase(season.phase),
      },
      changed: false,
      transition: null,
    };
  }

  const transitionResult = await prisma.$transaction(async (tx) => {
    const updated = await tx.season.update({
      where: { id: season.id },
      data: { phase: normalizedNextPhase },
    });

    const transition = await tx.leaguePhaseTransition.create({
      data: {
        leagueId: input.leagueId,
        seasonId: season.id,
        fromPhase: season.phase,
        toPhase: normalizedNextPhase,
        initiatedByUserId: input.initiatedByUserId ?? null,
        initiatedByType: input.initiatedByType ?? "COMMISSIONER",
        reason: input.reason ?? null,
        transitionStatus: "SUCCESS",
        occurredAt: new Date(),
      },
    });

    await logTransaction(tx, {
      leagueId: input.leagueId,
      seasonId: season.id,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Season phase changed from ${season.phase} to ${normalizedNextPhase}.`,
      metadata: {
        beforePhase: season.phase,
        afterPhase: normalizedNextPhase,
        updatedBy: input.actor ?? "api/commissioner/season/phase POST",
      },
    });

    return {
      updated,
      transition,
    };
  });

  return {
    season: {
      ...transitionResult.updated,
      phase: toLegacyLeaguePhase(transitionResult.updated.phase),
    },
    changed: true,
    transition: transitionResult.transition,
  };
}
