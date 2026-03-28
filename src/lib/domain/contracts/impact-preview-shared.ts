import type { TeamValidationContext } from "@/lib/compliance/context";
import { RuleResult, TeamComplianceReport } from "@/types/compliance";
import { ContractImpactPreview, ImpactPreviewSnapshot } from "@/types/detail";

type PreviewFindingFingerprint = {
  ruleCode: string;
  contractId?: unknown;
  rosterSlotId?: unknown;
  playerId?: unknown;
  slotLabel?: unknown;
};

export function buildImpactSnapshot(
  context: TeamValidationContext,
  report: TeamComplianceReport,
): ImpactPreviewSnapshot {
  const activeCapTotal = context.contracts.reduce(
    (total, contract) => total + contract.salary,
    0,
  );
  const deadCapTotal = context.capPenalties.reduce(
    (total, penalty) => total + penalty.amount,
    0,
  );

  return {
    rosterCount: context.rosterSlots.length,
    activeCapTotal,
    deadCapTotal,
    hardCapTotal: activeCapTotal + deadCapTotal,
    complianceStatus: report.status,
    complianceErrors: report.summary.errors,
    complianceWarnings: report.summary.warnings,
  };
}

export function buildImpactDelta(
  before: ImpactPreviewSnapshot,
  after: ImpactPreviewSnapshot,
): ContractImpactPreview["delta"] {
  return {
    rosterCount: after.rosterCount - before.rosterCount,
    activeCapTotal: after.activeCapTotal - before.activeCapTotal,
    deadCapTotal: after.deadCapTotal - before.deadCapTotal,
    hardCapTotal: after.hardCapTotal - before.hardCapTotal,
  };
}

export function getIntroducedFindings(
  beforeReport: TeamComplianceReport,
  afterReport: TeamComplianceReport,
): RuleResult[] {
  const beforeFingerprints = new Set(
    beforeReport.findings.map((finding) => findingFingerprint(finding)),
  );

  return afterReport.findings.filter(
    (finding) => !beforeFingerprints.has(findingFingerprint(finding)),
  );
}

export function mapImpactFindings(findings: RuleResult[]) {
  return findings.map((finding) => ({
    ruleCode: finding.ruleCode,
    severity: finding.severity,
    message: finding.message,
    context: finding.context,
  }));
}

function findingFingerprint(finding: RuleResult) {
  const context = finding.context ?? {};
  const identifiers: PreviewFindingFingerprint = {
    ruleCode: finding.ruleCode,
    contractId: context.contractId,
    rosterSlotId: context.rosterSlotId,
    playerId: context.playerId,
    slotLabel: context.slotLabel,
  };

  return JSON.stringify(identifiers);
}
