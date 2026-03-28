import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateDraftSelectionInput,
  DraftsRepositoryDbClient,
  UpdateDraftSelectionInput,
} from "@/lib/repositories/drafts/types";

export const draftSelectionInclude = Prisma.validator<Prisma.DraftSelectionInclude>()({
  draftPick: {
    select: {
      id: true,
      pickNumber: true,
      round: true,
      status: true,
    },
  },
  pick: {
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
  player: {
    select: {
      id: true,
      name: true,
      position: true,
    },
  },
  actedByUser: {
    select: {
      id: true,
      email: true,
      name: true,
    },
  },
  contract: {
    select: {
      id: true,
      salary: true,
      yearsTotal: true,
      yearsRemaining: true,
      status: true,
    },
  },
  rosterAssignment: {
    select: {
      id: true,
      rosterStatus: true,
      effectiveAt: true,
      endedAt: true,
    },
  },
});

export type DraftSelectionRecord = Prisma.DraftSelectionGetPayload<{
  include: typeof draftSelectionInclude;
}>;

function toCreateInput(input: CreateDraftSelectionInput): Prisma.DraftSelectionCreateInput {
  return {
    draft: {
      connect: {
        id: input.draftId,
      },
    },
    ...(input.draftPickId
      ? {
          draftPick: {
            connect: {
              id: input.draftPickId,
            },
          },
        }
      : {}),
    ...(input.pickId
      ? {
          pick: {
            connect: {
              id: input.pickId,
            },
          },
        }
      : {}),
    selectingTeam: {
      connect: {
        id: input.selectingTeamId,
      },
    },
    ...(input.playerId
      ? {
          player: {
            connect: {
              id: input.playerId,
            },
          },
        }
      : {}),
    ...(input.actedByUserId
      ? {
          actedByUser: {
            connect: {
              id: input.actedByUserId,
            },
          },
        }
      : {}),
    ...(input.contractId
      ? {
          contract: {
            connect: {
              id: input.contractId,
            },
          },
        }
      : {}),
    ...(input.rosterAssignmentId
      ? {
          rosterAssignment: {
            connect: {
              id: input.rosterAssignmentId,
            },
          },
        }
      : {}),
    round: input.round,
    pickNumber: input.pickNumber,
    salary: input.salary ?? null,
    contractYears: input.contractYears ?? null,
    outcome: input.outcome ?? "SELECTED",
    isPassed: input.isPassed ?? false,
    madeAt: input.madeAt ?? null,
  };
}

export function createDraftSelectionRepository(
  client: DraftsRepositoryDbClient = prisma,
) {
  return {
    create(input: CreateDraftSelectionInput) {
      return client.draftSelection.create({
        data: toCreateInput(input),
        include: draftSelectionInclude,
      });
    },

    findById(selectionId: string) {
      return client.draftSelection.findUnique({
        where: {
          id: selectionId,
        },
        include: draftSelectionInclude,
      });
    },

    listForDraft(draftId: string) {
      return client.draftSelection.findMany({
        where: {
          draftId,
        },
        include: draftSelectionInclude,
        orderBy: [{ pickNumber: "asc" }, { createdAt: "asc" }],
      });
    },

    update(selectionId: string, input: UpdateDraftSelectionInput) {
      return client.draftSelection.update({
        where: {
          id: selectionId,
        },
        data: {
          draftPickId: input.draftPickId,
          pickId: input.pickId,
          selectingTeamId: input.selectingTeamId,
          playerId: input.playerId,
          actedByUserId: input.actedByUserId,
          contractId: input.contractId,
          rosterAssignmentId: input.rosterAssignmentId,
          salary: input.salary,
          contractYears: input.contractYears,
          outcome: input.outcome,
          isPassed: input.isPassed,
          madeAt: input.madeAt,
        },
        include: draftSelectionInclude,
      });
    },
  };
}
