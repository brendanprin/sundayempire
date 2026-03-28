import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { createReadOnlyValidationContextLoader } from "@/lib/compliance/read-context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { createFranchiseTagUsageService } from "@/lib/domain/contracts/franchise-tag-usage-service";
import {
  buildImpactDelta,
  buildImpactSnapshot,
  getIntroducedFindings,
  mapImpactFindings,
} from "@/lib/domain/contracts/impact-preview-shared";
import { ContractDbClient } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";
import { ContractImpactPreview } from "@/types/detail";

export function createFranchiseTagImpactPreviewService(
  client: ContractDbClient = prisma,
) {
  const tagService = createFranchiseTagUsageService(client);
  const validationLoader = createReadOnlyValidationContextLoader(client);

  return {
    async preview(input: {
      contractId: string;
      now?: Date;
    }): Promise<ContractImpactPreview> {
      const now = input.now ?? new Date();
      const preview = await tagService.previewFranchiseTag({
        contractId: input.contractId,
      });

      const validationContext = await validationLoader.loadTeamValidationContext({
        leagueId: preview.contract.team.leagueId,
        seasonId: preview.contract.seasonId,
        teamId: preview.contract.teamId,
      });

      if (!validationContext) {
        throw new Error("TEAM_VALIDATION_CONTEXT_NOT_FOUND");
      }

      const beforeReport = evaluateComplianceFromContext(validationContext);
      const afterContext = {
        ...validationContext,
        contracts: validationContext.contracts.map((contract) =>
          contract.id === preview.contract.id
            ? {
                ...contract,
                salary: preview.finalTagSalary,
                yearsTotal: 1,
                yearsRemaining: 1,
                isFranchiseTag: true,
              }
            : contract,
        ),
      };
      const afterReport = evaluateComplianceFromContext(afterContext);
      const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);

      return {
        action: "franchise_tag",
        legal: introducedErrors.length === 0,
        blockedReason:
          introducedErrors.length > 0
            ? "Applying franchise tag would introduce new compliance errors."
            : null,
        target: {
          team: {
            id: preview.contract.teamId,
            name: validationContext.team.name,
            abbreviation: validationContext.team.abbreviation,
          },
          player: {
            id: preview.contract.playerId,
            name: preview.contract.player.name,
            position: preview.contract.player.position,
          },
          contract: {
            id: preview.contract.id,
            salary: preview.contract.salary,
            yearsTotal: preview.contract.yearsTotal,
            yearsRemaining: preview.contract.yearsRemaining,
            status: preview.contract.status,
          },
        },
        before: buildImpactSnapshot(validationContext, beforeReport),
        after: buildImpactSnapshot(afterContext, afterReport),
        delta: buildImpactDelta(
          buildImpactSnapshot(validationContext, beforeReport),
          buildImpactSnapshot(afterContext, afterReport),
        ),
        introducedFindings: mapImpactFindings(
          getIntroducedFindings(beforeReport, afterReport),
        ),
        assumptions: {
          afterTradeDeadline: null,
          coverageEstimated: false,
        },
        details: {
          currentSeasonDeadCapCharge: null,
          franchiseTag: {
            priorSalary: preview.priorSalary,
            calculatedTopTierAverage: preview.calculatedTopTierAverage,
            calculated120PercentSalary: preview.calculated120PercentSalary,
            finalTagSalary: preview.finalTagSalary,
            frozenSnapshotSeasonId: preview.frozenSnapshotSeasonId,
          },
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
