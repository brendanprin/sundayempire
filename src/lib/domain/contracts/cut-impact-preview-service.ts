import { ACTIVE_CONTRACT_STATUSES, ContractDbClient } from "@/lib/domain/contracts/shared";
import { computeDeadCapSchedule } from "@/lib/domain/contracts/dead-cap-calculator";
import { createReadOnlyValidationContextLoader } from "@/lib/compliance/read-context";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import {
  buildImpactDelta,
  buildImpactSnapshot,
  getIntroducedFindings,
  mapImpactFindings,
} from "@/lib/domain/contracts/impact-preview-shared";
import { isPlayerRetired } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";
import { ContractImpactPreview } from "@/types/detail";

export function createCutImpactPreviewService(client: ContractDbClient = prisma) {
  const validationLoader = createReadOnlyValidationContextLoader(client);

  return {
    async preview(input: {
      leagueId: string;
      seasonId: string;
      teamId: string;
      rosterSlotId?: string;
      playerId?: string;
      afterTradeDeadline?: boolean;
      now?: Date;
    }): Promise<ContractImpactPreview> {
      const now = input.now ?? new Date();
      const afterTradeDeadline = Boolean(input.afterTradeDeadline);

      const team = await client.team.findFirst({
        where: {
          id: input.teamId,
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      });
      if (!team) {
        throw new Error("TEAM_NOT_FOUND");
      }

      const slot = input.rosterSlotId
        ? await client.rosterSlot.findFirst({
            where: {
              id: input.rosterSlotId,
              teamId: input.teamId,
              seasonId: input.seasonId,
            },
            select: {
              id: true,
              playerId: true,
              slotLabel: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  injuryStatus: true,
                },
              },
            },
          })
        : input.playerId
          ? await client.rosterSlot.findFirst({
              where: {
                playerId: input.playerId,
                teamId: input.teamId,
                seasonId: input.seasonId,
              },
              select: {
                id: true,
                playerId: true,
                slotLabel: true,
                player: {
                  select: {
                    id: true,
                    name: true,
                    position: true,
                    injuryStatus: true,
                  },
                },
              },
            })
          : null;

      if (!slot) {
        throw new Error("ROSTER_SLOT_NOT_FOUND");
      }

      const [season, orderedSeasons, validationContext, activeContract] = await Promise.all([
        client.season.findFirst({
          where: {
            id: input.seasonId,
            leagueId: input.leagueId,
          },
          select: {
            id: true,
            year: true,
          },
        }),
        client.season.findMany({
          where: {
            leagueId: input.leagueId,
          },
          orderBy: {
            year: "asc",
          },
          select: {
            id: true,
            year: true,
          },
        }),
        validationLoader.loadTeamValidationContext({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.teamId,
        }),
        client.contract.findFirst({
          where: {
            seasonId: input.seasonId,
            teamId: input.teamId,
            playerId: slot.player.id,
            status: {
              in: [...ACTIVE_CONTRACT_STATUSES],
            },
          },
          select: {
            id: true,
            salary: true,
            yearsTotal: true,
            yearsRemaining: true,
            status: true,
          },
        }),
      ]);

      if (!season || !validationContext) {
        throw new Error("TEAM_VALIDATION_CONTEXT_NOT_FOUND");
      }

      const beforeReport = evaluateComplianceFromContext(validationContext);
      const deadCapSchedule = activeContract
        ? computeDeadCapSchedule({
            annualSalary: activeContract.salary,
            yearsRemaining: activeContract.yearsRemaining,
            afterTradeDeadline,
            retired: isPlayerRetired(slot.player.injuryStatus),
          })
        : [];

      const currentSeasonDeadCapCharge =
        deadCapSchedule.find((entry) => entry.seasonOffset === 0)?.amount ?? 0;

      const afterContext = {
        ...validationContext,
        rosterSlots: validationContext.rosterSlots.filter(
          (rosterSlot) => rosterSlot.player.id !== slot.player.id,
        ),
        contracts: validationContext.contracts.filter(
          (contract) => contract.id !== activeContract?.id,
        ),
        capPenalties:
          currentSeasonDeadCapCharge > 0
            ? [
                ...validationContext.capPenalties,
                {
                  id: `preview-cut-${slot.player.id}`,
                  amount: currentSeasonDeadCapCharge,
                  reason: "Preview dead cap from cut",
                },
              ]
            : validationContext.capPenalties,
      };

      const afterReport = evaluateComplianceFromContext(afterContext);
      const beforeSnapshot = buildImpactSnapshot(validationContext, beforeReport);
      const afterSnapshot = buildImpactSnapshot(afterContext, afterReport);
      const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);

      return {
        action: "cut",
        legal: introducedErrors.length === 0,
        blockedReason:
          introducedErrors.length > 0
            ? "Cut would introduce new compliance errors."
            : null,
        target: {
          team,
          player: {
            id: slot.player.id,
            name: slot.player.name,
            position: slot.player.position,
          },
          contract: activeContract
            ? {
                id: activeContract.id,
                salary: activeContract.salary,
                yearsTotal: activeContract.yearsTotal,
                yearsRemaining: activeContract.yearsRemaining,
                status: activeContract.status,
              }
            : null,
        },
        before: beforeSnapshot,
        after: afterSnapshot,
        delta: buildImpactDelta(beforeSnapshot, afterSnapshot),
        introducedFindings: mapImpactFindings(
          getIntroducedFindings(beforeReport, afterReport),
        ),
        assumptions: {
          afterTradeDeadline,
          coverageEstimated: false,
        },
        details: {
          currentSeasonDeadCapCharge,
          deadCapSchedule: deadCapSchedule.map((entry) => ({
            seasonOffset: entry.seasonOffset,
            seasonYear: orderedSeasons.find(
              (candidate) => candidate.year === season.year + entry.seasonOffset,
            )?.year ?? null,
            amount: entry.amount,
          })),
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
