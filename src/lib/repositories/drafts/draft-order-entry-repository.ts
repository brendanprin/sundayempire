import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  DraftOrderEntryUpdateInput,
  DraftOrderEntryWriteInput,
  DraftsRepositoryDbClient,
} from "@/lib/repositories/drafts/types";

export const draftOrderEntryInclude = Prisma.validator<Prisma.DraftOrderEntryInclude>()({
  futurePick: {
    include: {
      originalTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      },
      currentTeam: {
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      },
    },
  },
  originalTeam: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  owningTeam: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  selectingTeam: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  createdByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  draftPick: {
    select: {
      id: true,
      status: true,
      pickNumber: true,
      round: true,
    },
  },
});

export type DraftOrderEntryRecord = Prisma.DraftOrderEntryGetPayload<{
  include: typeof draftOrderEntryInclude;
}>;

function toCreateManyRow(
  draftId: string,
  entry: DraftOrderEntryWriteInput,
): Prisma.DraftOrderEntryCreateManyInput {
  return {
    draftId,
    seasonId: entry.seasonId,
    pickNumber: entry.pickNumber,
    round: entry.round,
    sourceType: entry.sourceType,
    futurePickId: entry.futurePickId ?? null,
    originalTeamId: entry.originalTeamId ?? null,
    owningTeamId: entry.owningTeamId,
    selectingTeamId: entry.selectingTeamId,
    isBonus: entry.isBonus ?? false,
    isManualOverride: entry.isManualOverride ?? false,
    overrideReason: entry.overrideReason ?? null,
    createdByUserId: entry.createdByUserId ?? null,
  };
}

export function createDraftOrderEntryRepository(
  client: DraftsRepositoryDbClient = prisma,
) {
  return {
    async replaceForDraft(input: {
      draftId: string;
      entries: DraftOrderEntryWriteInput[];
    }) {
      await client.draftOrderEntry.deleteMany({
        where: {
          draftId: input.draftId,
        },
      });

      if (input.entries.length === 0) {
        return { count: 0 };
      }

      return client.draftOrderEntry.createMany({
        data: input.entries.map((entry) => toCreateManyRow(input.draftId, entry)),
      });
    },

    create(input: { draftId: string; entry: DraftOrderEntryWriteInput }) {
      return client.draftOrderEntry.create({
        data: toCreateManyRow(input.draftId, input.entry),
        include: draftOrderEntryInclude,
      });
    },

    findById(entryId: string) {
      return client.draftOrderEntry.findUnique({
        where: {
          id: entryId,
        },
        include: draftOrderEntryInclude,
      });
    },

    listForDraft(draftId: string) {
      return client.draftOrderEntry.findMany({
        where: {
          draftId,
        },
        include: draftOrderEntryInclude,
        orderBy: [{ pickNumber: "asc" }, { createdAt: "asc" }],
      });
    },

    update(entryId: string, input: DraftOrderEntryUpdateInput) {
      return client.draftOrderEntry.update({
        where: {
          id: entryId,
        },
        data: {
          futurePickId: input.futurePickId,
          originalTeamId: input.originalTeamId,
          owningTeamId: input.owningTeamId,
          selectingTeamId: input.selectingTeamId,
          sourceType: input.sourceType,
          isBonus: input.isBonus,
          isManualOverride: input.isManualOverride,
          overrideReason: input.overrideReason,
          createdByUserId: input.createdByUserId,
        },
        include: draftOrderEntryInclude,
      });
    },
  };
}
