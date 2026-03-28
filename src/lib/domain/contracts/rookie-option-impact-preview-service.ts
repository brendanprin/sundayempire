import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { createReadOnlyValidationContextLoader } from "@/lib/compliance/read-context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import {
  buildImpactDelta,
  buildImpactSnapshot,
  getIntroducedFindings,
  mapImpactFindings,
} from "@/lib/domain/contracts/impact-preview-shared";
import { createRookieOptionService } from "@/lib/domain/contracts/rookie-option-service";
import { ContractDbClient } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";
import { ContractImpactPreview } from "@/types/detail";

export function createRookieOptionImpactPreviewService(
  client: ContractDbClient = prisma,
) {
  const optionService = createRookieOptionService(client);
  const validationLoader = createReadOnlyValidationContextLoader(client);

  return {
    async preview(input: {
      contractId: string;
      yearsToAdd: number;
      maxContractYears: number;
      now?: Date;
    }): Promise<ContractImpactPreview> {
      const now = input.now ?? new Date();
      const preview = await optionService.previewOptionExercise({
        contractId: input.contractId,
        yearsToAdd: input.yearsToAdd,
        maxContractYears: input.maxContractYears,
      });
      const team = await client.team.findUnique({
        where: {
          id: preview.contract.teamId,
        },
        select: {
          leagueId: true,
          abbreviation: true,
        },
      });
      if (!team) {
        throw new Error("TEAM_VALIDATION_CONTEXT_NOT_FOUND");
      }
      const validationContext = await validationLoader.loadTeamValidationContext({
        leagueId: team.leagueId,
        seasonId: preview.contract.seasonId,
        teamId: preview.contract.teamId,
      });

      if (!validationContext) {
        throw new Error("TEAM_VALIDATION_CONTEXT_NOT_FOUND");
      }

      const beforeReport = evaluateComplianceFromContext(validationContext);
      const validationContract = validationContext.contracts.find(
        (contract) => contract.id === preview.contract.id,
      );
      const afterContext = {
        ...validationContext,
        contracts: validationContext.contracts.map((contract) =>
          contract.id === preview.contract.id
            ? {
                ...contract,
                yearsTotal: preview.nextYearsTotal,
                yearsRemaining: preview.nextYearsRemaining,
              }
            : contract,
        ),
      };
      const afterReport = evaluateComplianceFromContext(afterContext);
      const beforeSnapshot = buildImpactSnapshot(validationContext, beforeReport);
      const afterSnapshot = buildImpactSnapshot(afterContext, afterReport);
      const introducedErrors = getIntroducedErrorFindings(beforeReport, afterReport);

      return {
        action: "rookie_option",
        legal: introducedErrors.length === 0,
        blockedReason:
          introducedErrors.length > 0
            ? "Exercising rookie option would introduce new compliance errors."
            : null,
        target: {
          team: {
            id: preview.contract.teamId,
            name: preview.contract.team.name,
            abbreviation: team.abbreviation,
          },
          player: {
            id: preview.contract.playerId,
            name: preview.contract.player.name,
            position: validationContract?.player.position ?? "WR",
          },
          contract: {
            id: preview.contract.id,
            salary: preview.contract.salary,
            yearsTotal: preview.contract.yearsTotal,
            yearsRemaining: preview.contract.yearsRemaining,
            status: preview.contract.status,
          },
        },
        before: beforeSnapshot,
        after: afterSnapshot,
        delta: buildImpactDelta(beforeSnapshot, afterSnapshot),
        introducedFindings: mapImpactFindings(
          getIntroducedFindings(beforeReport, afterReport),
        ),
        assumptions: {
          afterTradeDeadline: null,
          coverageEstimated: false,
        },
        details: {
          currentSeasonDeadCapCharge: null,
          rookieOption: {
            yearsToAdd: input.yearsToAdd,
            nextYearsTotal: preview.nextYearsTotal,
            nextYearsRemaining: preview.nextYearsRemaining,
          },
        },
        generatedAt: now.toISOString(),
      };
    },
  };
}
