import { prisma } from "@/lib/prisma";
import {
  TeamValidationContext,
  ValidationContextLookup,
} from "@/lib/compliance/context";
import { createReadOnlyValidationContextLoader } from "@/lib/compliance/read-context";
import { validateCapCompliance } from "@/lib/compliance/rules/cap";
import { validateContractRules } from "@/lib/compliance/rules/contracts";
import { validateFranchiseTagRules } from "@/lib/compliance/rules/franchise-tag";
import { validateIrRules } from "@/lib/compliance/rules/ir";
import { validateStartingLineup } from "@/lib/compliance/rules/lineup";
import { validateRosterSize } from "@/lib/compliance/rules/roster-size";
import {
  ComplianceStatus,
  LeagueComplianceReport,
  RuleResult,
  TeamComplianceReport,
} from "@/types/compliance";

function deriveComplianceStatus(findings: RuleResult[]): ComplianceStatus {
  if (findings.some((finding) => finding.severity === "error")) {
    return "error";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }

  return "ok";
}

function summarizeFindings(findings: RuleResult[]) {
  return {
    errors: findings.filter((finding) => finding.severity === "error").length,
    warnings: findings.filter((finding) => finding.severity === "warning").length,
  };
}

export function evaluateComplianceFromContext(
  context: TeamValidationContext,
): TeamComplianceReport {
  const findings = [
    ...validateRosterSize(context),
    ...validateStartingLineup(context),
    ...validateCapCompliance(context),
    ...validateContractRules(context),
    ...validateFranchiseTagRules(context),
    ...validateIrRules(context),
  ];

  return {
    teamId: context.team.id,
    status: deriveComplianceStatus(findings),
    evaluatedAt: new Date().toISOString(),
    findings,
    summary: summarizeFindings(findings),
  };
}

type ComplianceEvaluationDependencies = {
  validationContextLoader?: Pick<
    ReturnType<typeof createReadOnlyValidationContextLoader>,
    "loadTeamValidationContext"
  >;
  teamReader?: Pick<typeof prisma.team, "findMany">;
};

export function createComplianceEvaluationService(
  dependencies: ComplianceEvaluationDependencies = {},
) {
  const validationContextLoader =
    dependencies.validationContextLoader ?? createReadOnlyValidationContextLoader(prisma);
  const teamReader = dependencies.teamReader ?? prisma.team;
  const evaluateTeamCompliance = async (
    lookup: ValidationContextLookup,
  ): Promise<TeamComplianceReport | null> => {
    const context = await validationContextLoader.loadTeamValidationContext(lookup);
    if (!context) {
      return null;
    }

    return evaluateComplianceFromContext(context);
  };

  return {
    evaluateTeamCompliance,
    async evaluateLeagueCompliance(input: {
      leagueId: string;
      seasonId: string;
    }): Promise<LeagueComplianceReport> {
      const teams = await teamReader.findMany({
        where: {
          leagueId: input.leagueId,
        },
        select: {
          id: true,
        },
        orderBy: {
          name: "asc",
        },
      });

      const reports: TeamComplianceReport[] = [];
      for (const team of teams) {
        const report = await evaluateTeamCompliance({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: team.id,
        });
        if (report) {
          reports.push(report);
        }
      }

      const evaluatedAt = new Date().toISOString();

      return {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        evaluatedAt,
        summary: {
          teamsEvaluated: reports.length,
          ok: reports.filter((report) => report.status === "ok").length,
          warning: reports.filter((report) => report.status === "warning").length,
          error: reports.filter((report) => report.status === "error").length,
          totalFindings: reports.reduce((total, report) => total + report.findings.length, 0),
        },
        teams: reports,
      };
    },
  };
}

const defaultComplianceEvaluationService = createComplianceEvaluationService();

export async function evaluateTeamCompliance(
  lookup: ValidationContextLookup,
): Promise<TeamComplianceReport | null> {
  return defaultComplianceEvaluationService.evaluateTeamCompliance(lookup);
}

export async function evaluateLeagueCompliance(input: {
  leagueId: string;
  seasonId: string;
}): Promise<LeagueComplianceReport> {
  return defaultComplianceEvaluationService.evaluateLeagueCompliance(input);
}
