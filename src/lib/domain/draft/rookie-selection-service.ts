import { Prisma, TransactionType } from "@prisma/client";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";
import {
  formatRookieDraftCompletedActivity,
  formatRookieDraftPickForfeitedActivity,
  formatRookieDraftPickPassedActivity,
  formatRookieDraftPickSelectedActivity,
} from "@/lib/domain/activity/formatters";
import { createComplianceIssueService } from "@/lib/domain/compliance/compliance-issue-service";
import { createPostDraftWarningService } from "@/lib/domain/draft/post-draft-warning-service";
import { createRookieContractCreationService } from "@/lib/domain/draft/rookie-contract-creation-service";
import { createRookieSalaryService } from "@/lib/domain/draft/rookie-salary-service";
import { isResolvedDraftPickStatus, isRookieEligibleYearsPro } from "@/lib/domain/draft/shared";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { logTransaction } from "@/lib/transactions";
import { toDraftSummary } from "@/lib/draft";

class RookieDraftActionError extends Error {
  status: number;
  code: string;
  context?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, context?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.context = context;
  }
}

function assertActorCanAct(input: {
  actorRole: CanonicalLeagueRole;
  actorTeamId: string | null;
  selectingTeamId: string;
}) {
  if (input.actorRole === "COMMISSIONER") {
    return;
  }

  if (input.actorRole === "MEMBER" && input.actorTeamId === input.selectingTeamId) {
    return;
  }

  throw new RookieDraftActionError(403, "FORBIDDEN", "You do not have permission for this draft pick.", {
    selectingTeamId: input.selectingTeamId,
  });
}

function toResolvedStatus(outcome: "SELECTED" | "PASSED" | "FORFEITED") {
  if (outcome === "SELECTED") {
    return "SELECTED";
  }

  if (outcome === "PASSED") {
    return "PASSED";
  }

  return "FORFEITED";
}

export function createRookieSelectionService() {
  const rookieSalaryService = createRookieSalaryService();
  const activityPublisher = createActivityPublisher(prisma);

  async function loadDraftContext(input: {
    draftId: string;
    leagueId: string;
    seasonId: string;
  }) {
    const draft = await prisma.draft.findFirst({
      where: {
        id: input.draftId,
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        type: "ROOKIE",
      },
      include: {
        season: {
          select: {
            year: true,
          },
        },
      },
    });

    if (!draft) {
      throw new RookieDraftActionError(404, "DRAFT_NOT_FOUND", "Rookie draft was not found.", {
        draftId: input.draftId,
      });
    }

    return draft;
  }

  async function finalizeDraftAfterPick(input: {
    tx: Prisma.TransactionClient;
    draftId: string;
    currentPickIndex: number;
    totalPicks: number;
    resolvedAt: Date;
  }) {
    const maxPickIndex = Math.max(input.totalPicks - 1, 0);
    const isLastPick = input.currentPickIndex >= maxPickIndex;

    const updatedDraft = await input.tx.draft.update({
      where: {
        id: input.draftId,
      },
      data: {
        currentPickIndex: isLastPick ? maxPickIndex : input.currentPickIndex + 1,
        status: isLastPick ? "COMPLETED" : "IN_PROGRESS",
        completedAt: isLastPick ? input.resolvedAt : null,
      },
    });

    return {
      updatedDraft,
      completed: isLastPick,
    };
  }

  return {
    async select(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      draftId: string;
      playerId: string;
      ruleset: {
        rookieBaseYears: number;
      };
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
    }) {
      const draft = await loadDraftContext(input);

      if (draft.status !== "IN_PROGRESS") {
        throw new RookieDraftActionError(409, "DRAFT_STATE_CONFLICT", "Rookie draft must be in progress to submit a pick.", {
          draftId: draft.id,
          currentStatus: draft.status,
        });
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const totalPicks = await tx.draftPick.count({
            where: {
              draftId: draft.id,
            },
          });

          if (totalPicks === 0) {
            throw new RookieDraftActionError(
              409,
              "DRAFT_SETUP_REQUIRED",
              "The rookie draft board has not been generated yet.",
              {
                draftId: draft.id,
              },
            );
          }

          const pickNumber = draft.currentPickIndex + 1;
          const currentPick = await tx.draftPick.findFirst({
            where: {
              draftId: draft.id,
              pickNumber,
            },
            include: {
              orderEntry: true,
              futurePick: true,
              selection: {
                select: {
                  id: true,
                },
              },
            },
          });

          if (!currentPick) {
            throw new RookieDraftActionError(409, "DRAFT_PICK_INVALID", "Current rookie draft pick is not defined.", {
              draftId: draft.id,
              pickNumber,
            });
          }

          if (isResolvedDraftPickStatus(currentPick.status) || currentPick.selection) {
            throw new RookieDraftActionError(409, "DRAFT_PICK_INVALID", "Current rookie draft pick has already been resolved.", {
              draftId: draft.id,
              pickNumber,
              status: currentPick.status,
            });
          }

          assertActorCanAct({
            actorRole: input.actor.leagueRole,
            actorTeamId: input.actor.teamId,
            selectingTeamId: currentPick.selectingTeamId,
          });

          if (currentPick.futurePick?.isUsed) {
            throw new RookieDraftActionError(409, "DRAFT_PICK_INVALID", "The underlying future pick is already marked used.", {
              futurePickId: currentPick.futurePickId,
            });
          }

          const player = await tx.player.findUnique({
            where: {
              id: input.playerId,
            },
            select: {
              id: true,
              name: true,
              position: true,
              yearsPro: true,
              isRestricted: true,
            },
          });

          if (!player) {
            throw new RookieDraftActionError(404, "PLAYER_NOT_FOUND", "Player was not found.", {
              playerId: input.playerId,
            });
          }

          if (!isRookieEligibleYearsPro(player.yearsPro)) {
            throw new RookieDraftActionError(
              409,
              "PLAYER_INELIGIBLE",
              "Only rookie-eligible players can be selected in the rookie draft.",
              {
                playerId: input.playerId,
                yearsPro: player.yearsPro,
              },
            );
          }

          if (player.isRestricted) {
            throw new RookieDraftActionError(409, "PLAYER_NOT_FOUND", "Restricted players cannot be selected in the rookie draft.", {
              playerId: input.playerId,
            });
          }

          const existingSelection = await tx.draftSelection.findFirst({
            where: {
              draftId: draft.id,
              playerId: input.playerId,
            },
            select: {
              id: true,
            },
          });

          if (existingSelection) {
            throw new RookieDraftActionError(409, "DRAFT_PICK_INVALID", "Player has already been selected in this draft.", {
              playerId: input.playerId,
            });
          }

          const selectionMadeAt = new Date();
          const salary = rookieSalaryService.salaryForSlot({
            round: currentPick.round,
            pickNumber: currentPick.pickNumber,
          });
          const yearsTotal = input.ruleset.rookieBaseYears;

          const selection = await tx.draftSelection.create({
            data: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              pickId: currentPick.futurePickId,
              selectingTeamId: currentPick.selectingTeamId,
              playerId: player.id,
              actedByUserId: input.actor.userId,
              round: currentPick.round,
              pickNumber: currentPick.pickNumber,
              salary,
              contractYears: yearsTotal,
              outcome: "SELECTED",
              isPassed: false,
              madeAt: selectionMadeAt,
            },
          });

          const rookieContractCreationService = createRookieContractCreationService(tx);
          const contractEffects = await rookieContractCreationService.createFromDraftSelection({
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            seasonYear: input.seasonYear,
            teamId: currentPick.selectingTeamId,
            playerId: player.id,
            salary,
            yearsTotal,
            effectiveAt: selectionMadeAt,
          });

          const updatedSelection = await tx.draftSelection.update({
            where: {
              id: selection.id,
            },
            data: {
              contractId: contractEffects.contract.id,
              rosterAssignmentId: contractEffects.rosterAssignment.id,
            },
          });

          await tx.draftPick.update({
            where: {
              id: currentPick.id,
            },
            data: {
              status: toResolvedStatus("SELECTED"),
              resolvedAt: selectionMadeAt,
            },
          });

          if (currentPick.futurePickId) {
            await tx.futurePick.update({
              where: {
                id: currentPick.futurePickId,
              },
              data: {
                isUsed: true,
              },
            });
          }

          const { updatedDraft, completed } = await finalizeDraftAfterPick({
            tx,
            draftId: draft.id,
            currentPickIndex: draft.currentPickIndex,
            totalPicks,
            resolvedAt: selectionMadeAt,
          });

          await logTransaction(tx, {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: currentPick.selectingTeamId,
            playerId: player.id,
            type: TransactionType.ADD,
            summary: `Draft added ${player.name} to ${contractEffects.team.name}.`,
            metadata: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              selectionId: updatedSelection.id,
              pickNumber: currentPick.pickNumber,
              round: currentPick.round,
              futurePickId: currentPick.futurePickId,
              rosterSlotId: contractEffects.rosterSlot.id,
              updatedBy: "api/drafts/[draftId]/actions/select POST",
            },
          });

          await logTransaction(tx, {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: currentPick.selectingTeamId,
            playerId: player.id,
            type: TransactionType.CONTRACT_CREATE,
            summary: `Draft created ${yearsTotal}-year $${salary} contract for ${player.name}.`,
            metadata: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              selectionId: updatedSelection.id,
              contractId: contractEffects.contract.id,
              updatedBy: "api/drafts/[draftId]/actions/select POST",
            },
          });

          const picksMade = await tx.draftPick.count({
            where: {
              draftId: draft.id,
              status: {
                not: "PENDING",
              },
            },
          });

          return {
            draft: toDraftSummary(
              {
                id: updatedDraft.id,
                leagueId: updatedDraft.leagueId,
                seasonId: updatedDraft.seasonId,
                type: updatedDraft.type,
                status: updatedDraft.status,
                title: updatedDraft.title,
                currentPickIndex: updatedDraft.currentPickIndex,
                startedAt: updatedDraft.startedAt,
                completedAt: updatedDraft.completedAt,
                createdAt: updatedDraft.createdAt,
                updatedAt: updatedDraft.updatedAt,
              },
              {
                totalPicks,
                picksMade,
              },
            ),
            completed,
            teamId: currentPick.selectingTeamId,
            activityEvent: formatRookieDraftPickSelectedActivity({
              draftId: draft.id,
              draftPickId: currentPick.id,
              selectionId: updatedSelection.id,
              round: currentPick.round,
              pickNumber: currentPick.pickNumber,
              team: {
                id: currentPick.selectingTeamId,
                name: contractEffects.team.name,
              },
              player: {
                id: player.id,
                name: player.name,
              },
              occurredAt: selectionMadeAt,
            }),
          };
        },
        {
          timeout: 15_000,
        },
      );

      await createComplianceIssueService(prisma).syncTeamComplianceState({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: result.teamId,
        actorUserId: input.actor.userId,
        actorRoleSnapshot: input.actor.leagueRole,
      });

      if (result.completed) {
        await createPostDraftWarningService(prisma).createCutdownWarnings({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          draftId: input.draftId,
          actorUserId: input.actor.userId,
          actorRoleSnapshot: input.actor.leagueRole,
        });
      }

      await activityPublisher.publishSafe({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        actorUserId: input.actor.userId,
        ...result.activityEvent,
      });

      if (result.completed) {
        await activityPublisher.publishSafe({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          actorUserId: input.actor.userId,
          ...formatRookieDraftCompletedActivity({
            draftId: input.draftId,
            title: draft.title,
            occurredAt: result.draft.completedAt ? new Date(result.draft.completedAt) : new Date(),
          }),
        });
      }

      return result;
    },

    async pass(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
    }) {
      const draft = await loadDraftContext(input);

      if (draft.status !== "IN_PROGRESS") {
        throw new RookieDraftActionError(409, "DRAFT_STATE_CONFLICT", "Rookie draft must be in progress to pass a pick.", {
          draftId: draft.id,
          currentStatus: draft.status,
        });
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const totalPicks = await tx.draftPick.count({
            where: {
              draftId: draft.id,
            },
          });
          const pickNumber = draft.currentPickIndex + 1;
          const currentPick = await tx.draftPick.findFirst({
            where: {
              draftId: draft.id,
              pickNumber,
            },
            include: {
              futurePick: true,
              selection: {
                select: {
                  id: true,
                },
              },
            },
          });

          if (!currentPick || isResolvedDraftPickStatus(currentPick.status) || currentPick.selection) {
            throw new RookieDraftActionError(409, "DRAFT_PICK_INVALID", "Current rookie draft pick cannot be passed.", {
              draftId: draft.id,
              pickNumber,
            });
          }

          assertActorCanAct({
            actorRole: input.actor.leagueRole,
            actorTeamId: input.actor.teamId,
            selectingTeamId: currentPick.selectingTeamId,
          });

          const resolvedAt = new Date();
          await tx.draftSelection.create({
            data: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              pickId: currentPick.futurePickId,
              selectingTeamId: currentPick.selectingTeamId,
              actedByUserId: input.actor.userId,
              round: currentPick.round,
              pickNumber: currentPick.pickNumber,
              outcome: "PASSED",
              isPassed: true,
              madeAt: resolvedAt,
            },
          });

          await tx.draftPick.update({
            where: {
              id: currentPick.id,
            },
            data: {
              status: toResolvedStatus("PASSED"),
              resolvedAt,
            },
          });

          if (currentPick.futurePickId) {
            await tx.futurePick.update({
              where: {
                id: currentPick.futurePickId,
              },
              data: {
                isUsed: true,
              },
            });
          }

          const { updatedDraft, completed } = await finalizeDraftAfterPick({
            tx,
            draftId: draft.id,
            currentPickIndex: draft.currentPickIndex,
            totalPicks,
            resolvedAt,
          });

          await logTransaction(tx, {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: currentPick.selectingTeamId,
            type: TransactionType.ROSTER_MOVE,
            summary: `Passed rookie draft pick ${currentPick.round}.${currentPick.pickNumber}.`,
            metadata: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              pickNumber: currentPick.pickNumber,
              round: currentPick.round,
              futurePickId: currentPick.futurePickId,
              updatedBy: "api/drafts/[draftId]/actions/pass POST",
            },
          });

          const picksMade = await tx.draftPick.count({
            where: {
              draftId: draft.id,
              status: {
                not: "PENDING",
              },
            },
          });

          return {
            draft: toDraftSummary(
              {
                id: updatedDraft.id,
                leagueId: updatedDraft.leagueId,
                seasonId: updatedDraft.seasonId,
                type: updatedDraft.type,
                status: updatedDraft.status,
                title: updatedDraft.title,
                currentPickIndex: updatedDraft.currentPickIndex,
                startedAt: updatedDraft.startedAt,
                completedAt: updatedDraft.completedAt,
                createdAt: updatedDraft.createdAt,
                updatedAt: updatedDraft.updatedAt,
              },
              {
                totalPicks,
                picksMade,
              },
            ),
            completed,
            activityData: {
              draftPickId: currentPick.id,
              round: currentPick.round,
              pickNumber: currentPick.pickNumber,
              teamId: currentPick.selectingTeamId,
              occurredAt: resolvedAt,
            },
          };
        },
        {
          timeout: 15_000,
        },
      );

      if (result.completed) {
        await createPostDraftWarningService(prisma).createCutdownWarnings({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          draftId: input.draftId,
          actorUserId: input.actor.userId,
          actorRoleSnapshot: input.actor.leagueRole,
        });
      }

      const currentPickTeam = await prisma.team.findUnique({
        where: {
          id: result.activityData.teamId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      await activityPublisher.publishSafe({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        actorUserId: input.actor.userId,
        ...formatRookieDraftPickPassedActivity({
          draftId: input.draftId,
          draftPickId: result.activityData.draftPickId,
          selectionId: null,
          round: result.activityData.round,
          pickNumber: result.activityData.pickNumber,
          team: currentPickTeam ?? {
            id: result.activityData.teamId,
            name: "Team",
          },
          occurredAt: result.activityData.occurredAt,
        }),
      });

      if (result.completed) {
        await activityPublisher.publishSafe({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          actorUserId: input.actor.userId,
          ...formatRookieDraftCompletedActivity({
            draftId: input.draftId,
            title: draft.title,
            occurredAt: result.draft.completedAt ? new Date(result.draft.completedAt) : new Date(),
          }),
        });
      }

      return result;
    },

    async forfeit(input: {
      leagueId: string;
      seasonId: string;
      draftId: string;
      actor: {
        userId: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      };
    }) {
      const draft = await loadDraftContext(input);

      if (draft.status !== "IN_PROGRESS") {
        throw new RookieDraftActionError(409, "DRAFT_STATE_CONFLICT", "Rookie draft must be in progress to forfeit a pick.", {
          draftId: draft.id,
          currentStatus: draft.status,
        });
      }

      if (input.actor.leagueRole !== "COMMISSIONER") {
        throw new RookieDraftActionError(403, "FORBIDDEN", "Only commissioners can forfeit rookie draft picks.");
      }

      const result = await prisma.$transaction(
        async (tx) => {
          const totalPicks = await tx.draftPick.count({
            where: {
              draftId: draft.id,
            },
          });
          const pickNumber = draft.currentPickIndex + 1;
          const currentPick = await tx.draftPick.findFirst({
            where: {
              draftId: draft.id,
              pickNumber,
            },
            include: {
              futurePick: true,
              selection: {
                select: {
                  id: true,
                },
              },
            },
          });

          if (!currentPick || isResolvedDraftPickStatus(currentPick.status) || currentPick.selection) {
            throw new RookieDraftActionError(409, "DRAFT_PICK_INVALID", "Current rookie draft pick cannot be forfeited.", {
              draftId: draft.id,
              pickNumber,
            });
          }

          const resolvedAt = new Date();
          await tx.draftSelection.create({
            data: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              pickId: currentPick.futurePickId,
              selectingTeamId: currentPick.selectingTeamId,
              actedByUserId: input.actor.userId,
              round: currentPick.round,
              pickNumber: currentPick.pickNumber,
              outcome: "FORFEITED",
              isPassed: true,
              madeAt: resolvedAt,
            },
          });

          await tx.draftPick.update({
            where: {
              id: currentPick.id,
            },
            data: {
              status: toResolvedStatus("FORFEITED"),
              resolvedAt,
            },
          });

          if (currentPick.futurePickId) {
            await tx.futurePick.update({
              where: {
                id: currentPick.futurePickId,
              },
              data: {
                isUsed: true,
              },
            });
          }

          const { updatedDraft, completed } = await finalizeDraftAfterPick({
            tx,
            draftId: draft.id,
            currentPickIndex: draft.currentPickIndex,
            totalPicks,
            resolvedAt,
          });

          await logTransaction(tx, {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: currentPick.selectingTeamId,
            type: TransactionType.COMMISSIONER_OVERRIDE,
            summary: `Forfeited rookie draft pick ${currentPick.round}.${currentPick.pickNumber}.`,
            metadata: {
              draftId: draft.id,
              draftPickId: currentPick.id,
              pickNumber: currentPick.pickNumber,
              round: currentPick.round,
              futurePickId: currentPick.futurePickId,
              updatedBy: "api/drafts/[draftId]/actions/forfeit POST",
            },
          });

          const picksMade = await tx.draftPick.count({
            where: {
              draftId: draft.id,
              status: {
                not: "PENDING",
              },
            },
          });

          return {
            draft: toDraftSummary(
              {
                id: updatedDraft.id,
                leagueId: updatedDraft.leagueId,
                seasonId: updatedDraft.seasonId,
                type: updatedDraft.type,
                status: updatedDraft.status,
                title: updatedDraft.title,
                currentPickIndex: updatedDraft.currentPickIndex,
                startedAt: updatedDraft.startedAt,
                completedAt: updatedDraft.completedAt,
                createdAt: updatedDraft.createdAt,
                updatedAt: updatedDraft.updatedAt,
              },
              {
                totalPicks,
                picksMade,
              },
            ),
            completed,
            activityData: {
              draftPickId: currentPick.id,
              round: currentPick.round,
              pickNumber: currentPick.pickNumber,
              teamId: currentPick.selectingTeamId,
              occurredAt: resolvedAt,
            },
          };
        },
        {
          timeout: 15_000,
        },
      );

      if (result.completed) {
        await createPostDraftWarningService(prisma).createCutdownWarnings({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          draftId: input.draftId,
          actorUserId: input.actor.userId,
          actorRoleSnapshot: input.actor.leagueRole,
        });
      }

      const currentPickTeam = await prisma.team.findUnique({
        where: {
          id: result.activityData.teamId,
        },
        select: {
          id: true,
          name: true,
        },
      });

      await activityPublisher.publishSafe({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        actorUserId: input.actor.userId,
        ...formatRookieDraftPickForfeitedActivity({
          draftId: input.draftId,
          draftPickId: result.activityData.draftPickId,
          selectionId: null,
          round: result.activityData.round,
          pickNumber: result.activityData.pickNumber,
          team: currentPickTeam ?? {
            id: result.activityData.teamId,
            name: "Team",
          },
          occurredAt: result.activityData.occurredAt,
        }),
      });

      if (result.completed) {
        await activityPublisher.publishSafe({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          actorUserId: input.actor.userId,
          ...formatRookieDraftCompletedActivity({
            draftId: input.draftId,
            title: draft.title,
            occurredAt: result.draft.completedAt ? new Date(result.draft.completedAt) : new Date(),
          }),
        });
      }

      return result;
    },

    isActionError(error: unknown): error is RookieDraftActionError {
      return error instanceof RookieDraftActionError;
    },
  };
}
