import { RuleResult, TeamComplianceReport } from "@/types/compliance";

function findingFingerprint(finding: RuleResult): string {
  const context = finding.context ?? {};
  const identifiers = {
    ruleCode: finding.ruleCode,
    contractId: context.contractId,
    rosterSlotId: context.rosterSlotId,
    playerId: context.playerId,
    slotLabel: context.slotLabel,
  };

  return JSON.stringify(identifiers);
}

export function getErrorFindings(report: TeamComplianceReport): RuleResult[] {
  return report.findings.filter((finding) => finding.severity === "error");
}

export function getIntroducedErrorFindings(
  beforeReport: TeamComplianceReport,
  afterReport: TeamComplianceReport,
): RuleResult[] {
  const beforeFingerprints = new Set(getErrorFindings(beforeReport).map(findingFingerprint));

  return getErrorFindings(afterReport).filter(
    (finding) => !beforeFingerprints.has(findingFingerprint(finding)),
  );
}
