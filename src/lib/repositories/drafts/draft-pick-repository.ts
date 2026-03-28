import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  DraftPickUpdateInput,
  DraftPickWriteInput,
  DraftsRepositoryDbClient,
} from "@/lib/repositories/drafts/types";

export const draftPickInclude = Prisma.validator<Prisma.DraftPickInclude>()({
  orderEntry: {
    include: {
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
    },
  },
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
  selectingTeam: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  selection: {
    select: {
      id: true,
      outcome: true,
      playerId: true,
      madeAt: true,
    },
  },
});

export type DraftPickRecord = Prisma.DraftPickGetPayload<{
  include: typeof draftPickInclude;
}>;

function toCreateManyRow(
  draftId: string,
  pick: DraftPickWriteInput,
): Prisma.DraftPickCreateManyInput {
  return {
    draftId,
    seasonId: pick.seasonId,
    draftOrderEntryId: pick.draftOrderEntryId,
    futurePickId: pick.futurePickId ?? null,
    selectingTeamId: pick.selectingTeamId,
    pickNumber: pick.pickNumber,
    round: pick.round,
    status: pick.status ?? "PENDING",
    openedAt: pick.openedAt ?? null,
    resolvedAt: pick.resolvedAt ?? null,
  };
}

export function createDraftPickRepository(client: DraftsRepositoryDbClient = prisma) {
  return {
    async replaceForDraft(input: {
      draftId: string;
      picks: DraftPickWriteInput[];
    }) {
      await client.draftPick.deleteMany({
        where: {
          draftId: input.draftId,
        },
      });

      if (input.picks.length === 0) {
        return { count: 0 };
      }

      return client.draftPick.createMany({
        data: input.picks.map((pick) => toCreateManyRow(input.draftId, pick)),
      });
    },

    create(input: { draftId: string; pick: DraftPickWriteInput }) {
      return client.draftPick.create({
        data: toCreateManyRow(input.draftId, input.pick),
        include: draftPickInclude,
      });
    },

    findById(draftPickId: string) {
      return client.draftPick.findUnique({
        where: {
          id: draftPickId,
        },
        include: draftPickInclude,
      });
    },

    findByPickNumber(input: { draftId: string; pickNumber: number }) {
      return client.draftPick.findFirst({
        where: {
          draftId: input.draftId,
          pickNumber: input.pickNumber,
        },
        include: draftPickInclude,
      });
    },

    listForDraft(draftId: string) {
      return client.draftPick.findMany({
        where: {
          draftId,
        },
        include: draftPickInclude,
        orderBy: [{ pickNumber: "asc" }, { createdAt: "asc" }],
      });
    },

    update(draftPickId: string, input: DraftPickUpdateInput) {
      return client.draftPick.update({
        where: {
          id: draftPickId,
        },
        data: {
          futurePickId: input.futurePickId,
          selectingTeamId: input.selectingTeamId,
          status: input.status,
          openedAt: input.openedAt,
          resolvedAt: input.resolvedAt,
        },
        include: draftPickInclude,
      });
    },
  };
}
