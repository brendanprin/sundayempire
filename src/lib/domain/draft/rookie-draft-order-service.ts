import { DraftStatus } from "@prisma/client";
import { createDraftOrderEntryRepository } from "@/lib/repositories/drafts/draft-order-entry-repository";
import { createDraftPickRepository } from "@/lib/repositories/drafts/draft-pick-repository";
import { createPickGenerationService } from "@/lib/domain/draft/pick-generation-service";
import {
  buildDefaultRookieDraftTitle,
  DEFAULT_ROOKIE_DRAFT_ROUNDS,
  deriveRookieOrderWarningKey,
  DraftDbClient,
  DraftWarning,
} from "@/lib/domain/draft/shared";
import { prisma } from "@/lib/prisma";

type RookieDraftOrderState = {
  entries: Awaited<ReturnType<ReturnType<typeof createDraftOrderEntryRepository>["listForDraft"]>>;
  picks: Awaited<ReturnType<ReturnType<typeof createDraftPickRepository>["listForDraft"]>>;
  warnings: DraftWarning[];
  estimatedOrderUsed: boolean;
  draft: {
    id: string;
    title: string;
    status: DraftStatus;
    seasonId: string;
    leagueId: string;
    seasonYear: number;
  };
};

function sortRoundPicks(
  picks: Array<{
    id: string;
    round: number;
    overall: number | null;
    originalTeamId: string;
    currentTeamId: string;
    originalTeam: {
      id: string;
      name: string;
      abbreviation: string | null;
    };
  }>,
) {
  return [...picks].sort((left, right) => {
    if (left.overall !== null && right.overall !== null && left.overall !== right.overall) {
      return left.overall - right.overall;
    }

    if (left.overall !== null && right.overall === null) {
      return -1;
    }

    if (left.overall === null && right.overall !== null) {
      return 1;
    }

    return left.originalTeam.name.localeCompare(right.originalTeam.name);
  });
}

export function createRookieDraftOrderService(client: DraftDbClient = prisma) {
  const pickGenerationService = createPickGenerationService(client);
  const orderEntryRepository = createDraftOrderEntryRepository(client);
  const draftPickRepository = createDraftPickRepository(client);

  async function resolveDraft(draftId: string) {
    const draft = await client.draft.findUnique({
      where: {
        id: draftId,
      },
      include: {
        season: {
          select: {
            id: true,
            year: true,
          },
        },
      },
    });

    if (!draft || draft.type !== "ROOKIE") {
      throw new Error("DRAFT_NOT_FOUND");
    }

    return {
      id: draft.id,
      title: draft.title || buildDefaultRookieDraftTitle(draft.season.year),
      status: draft.status,
      seasonId: draft.seasonId,
      leagueId: draft.leagueId,
      seasonYear: draft.season.year,
    };
  }

  async function readCurrentState(draftId: string): Promise<RookieDraftOrderState> {
    const [draft, entries, picks] = await Promise.all([
      resolveDraft(draftId),
      orderEntryRepository.listForDraft(draftId),
      draftPickRepository.listForDraft(draftId),
    ]);

    const warnings: DraftWarning[] = [];
    const estimatedOrderUsed = entries.some(
      (entry) => entry.futurePick && entry.futurePick.overall === null,
    );

    if (estimatedOrderUsed) {
      warnings.push({
        code: "ROOKIE_ORDER_ESTIMATED",
        message: "Some future picks are missing slot order, so the rookie board uses a safe fallback ordering.",
      });
    }

    return {
      draft,
      entries,
      picks,
      warnings,
      estimatedOrderUsed,
    };
  }

  return {
    readCurrentState,

    async ensureDraftBoard(input: {
      draftId: string;
      regenerate?: boolean;
      createdByUserId?: string | null;
    }): Promise<RookieDraftOrderState> {
      const draft = await resolveDraft(input.draftId);
      const existingSelections = await client.draftSelection.count({
        where: {
          draftId: draft.id,
        },
      });

      if (input.regenerate && (draft.status !== "NOT_STARTED" || existingSelections > 0)) {
        throw new Error("DRAFT_STATE_CONFLICT");
      }

      const existingEntries = await client.draftOrderEntry.count({
        where: {
          draftId: draft.id,
        },
      });

      if (existingEntries > 0 && !input.regenerate) {
        return readCurrentState(draft.id);
      }

      const generation = await pickGenerationService.ensureSupportedSeasonPicks({
        leagueId: draft.leagueId,
        seasonYear: draft.seasonYear,
        rounds: DEFAULT_ROOKIE_DRAFT_ROUNDS,
      });

      if (input.regenerate || existingEntries === 0) {
        await client.draftPick.deleteMany({
          where: {
            draftId: draft.id,
          },
        });
        await client.draftOrderEntry.deleteMany({
          where: {
            draftId: draft.id,
          },
        });
      }

      const warnings = [...generation.warnings];
      let estimatedOrderUsed = false;
      let pickNumber = 1;

      for (const round of DEFAULT_ROOKIE_DRAFT_ROUNDS) {
        const roundPicks = generation.picks.filter(
          (pick) => pick.round === round && !pick.isUsed,
        );

        if (roundPicks.some((pick) => pick.overall === null)) {
          estimatedOrderUsed = true;
          warnings.push({
            code: deriveRookieOrderWarningKey(round),
            message: `Round ${round} order is estimated because one or more future picks are missing overall slot data.`,
          });
        }

        for (const pick of sortRoundPicks(roundPicks)) {
          const entry = await orderEntryRepository.create({
            draftId: draft.id,
            entry: {
              seasonId: draft.seasonId,
              pickNumber,
              round,
              sourceType: "FUTURE_PICK",
              futurePickId: pick.id,
              originalTeamId: pick.originalTeamId,
              owningTeamId: pick.currentTeamId,
              selectingTeamId: pick.currentTeamId,
              isBonus: false,
              isManualOverride: false,
              overrideReason: null,
              createdByUserId: input.createdByUserId ?? null,
            },
          });

          await draftPickRepository.create({
            draftId: draft.id,
            pick: {
              seasonId: draft.seasonId,
              draftOrderEntryId: entry.id,
              futurePickId: pick.id,
              selectingTeamId: pick.currentTeamId,
              pickNumber,
              round,
              status: "PENDING",
            },
          });

          pickNumber += 1;
        }
      }

      await client.draft.update({
        where: {
          id: draft.id,
        },
        data: {
          currentPickIndex: 0,
        },
      });

      const state = await readCurrentState(draft.id);
      return {
        ...state,
        warnings: [...state.warnings, ...warnings],
        estimatedOrderUsed: state.estimatedOrderUsed || estimatedOrderUsed,
      };
    },

    async updateOrderEntry(input: {
      draftId: string;
      entryId: string;
      selectingTeamId: string;
      owningTeamId: string;
      reason: string;
      futurePickId?: string | null;
      originalTeamId?: string | null;
      sourceType?: "FUTURE_PICK" | "MANUAL" | "BONUS";
      createdByUserId?: string | null;
    }) {
      const draft = await resolveDraft(input.draftId);
      if (draft.status !== "NOT_STARTED") {
        throw new Error("DRAFT_STATE_CONFLICT");
      }

      const entry = await client.draftOrderEntry.findFirst({
        where: {
          id: input.entryId,
          draftId: draft.id,
        },
        select: {
          id: true,
          draftPick: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      });

      if (!entry) {
        throw new Error("DRAFT_PICK_INVALID");
      }

      if (entry.draftPick && entry.draftPick.status !== "PENDING") {
        throw new Error("DRAFT_STATE_CONFLICT");
      }

      const updatedEntry = await orderEntryRepository.update(input.entryId, {
        selectingTeamId: input.selectingTeamId,
        owningTeamId: input.owningTeamId,
        futurePickId: input.futurePickId ?? undefined,
        originalTeamId: input.originalTeamId ?? undefined,
        sourceType: input.sourceType ?? undefined,
        isManualOverride: true,
        overrideReason: input.reason.trim(),
        createdByUserId: input.createdByUserId ?? null,
      });

      if (entry.draftPick) {
        await draftPickRepository.update(entry.draftPick.id, {
          futurePickId: input.futurePickId ?? undefined,
          selectingTeamId: input.selectingTeamId,
        });
      }

      return updatedEntry;
    },
  };
}
