import {
  ComplianceIssueSeverity,
  ComplianceIssueSource,
  ComplianceIssueType,
} from "@prisma/client";
import { RuleResult } from "@/types/compliance";

type JsonRecord = Record<string, unknown>;

function contextRecord(value: RuleResult["context"]): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function toIssueSeverity(
  severity: "warning" | "error",
): ComplianceIssueSeverity {
  return severity === "error" ? "ERROR" : "WARNING";
}

export function toLegacySeverity(
  severity: ComplianceIssueSeverity,
): "warning" | "error" {
  return severity === "WARNING" ? "warning" : "error";
}

export function issueTypeFromRuleCode(ruleCode: string): ComplianceIssueType {
  if (ruleCode.startsWith("CAP_")) {
    return "CAP";
  }
  if (ruleCode.startsWith("CONTRACT_")) {
    return "CONTRACT";
  }
  if (ruleCode.startsWith("FRANCHISE_")) {
    return "FRANCHISE_TAG";
  }
  if (ruleCode.startsWith("IR_")) {
    return "IR";
  }
  if (ruleCode.startsWith("STARTER_")) {
    return "LINEUP";
  }

  return "ROSTER";
}

export function buildRuleIssueFingerprint(input: {
  seasonId: string;
  teamId: string;
  finding: RuleResult;
}) {
  const ctx = contextRecord(input.finding.context);
  return JSON.stringify({
    source: "RULE_ENGINE" satisfies ComplianceIssueSource,
    seasonId: input.seasonId,
    teamId: input.teamId,
    ruleCode: input.finding.ruleCode,
    contractId: typeof ctx.contractId === "string" ? ctx.contractId : null,
    playerId: typeof ctx.playerId === "string" ? ctx.playerId : null,
    rosterSlotId: typeof ctx.rosterSlotId === "string" ? ctx.rosterSlotId : null,
    slotLabel: typeof ctx.slotLabel === "string" ? ctx.slotLabel : null,
  });
}

export function buildDeadlineIssueFingerprint(input: {
  seasonId: string;
  deadlineId: string;
}) {
  return JSON.stringify({
    source: "DEADLINE" satisfies ComplianceIssueSource,
    seasonId: input.seasonId,
    deadlineId: input.deadlineId,
  });
}

export function buildManualIssueFingerprint(input: {
  seasonId: string;
  teamId?: string | null;
  code: string;
  title: string;
}) {
  return JSON.stringify({
    source: "MANUAL" satisfies ComplianceIssueSource,
    seasonId: input.seasonId,
    teamId: input.teamId ?? null,
    code: input.code,
    title: input.title.trim().toLowerCase(),
  });
}

export function buildRuleIssueTitle(input: {
  teamName: string;
  finding: RuleResult;
}) {
  const typeLabel = issueTypeFromRuleCode(input.finding.ruleCode)
    .toLowerCase()
    .replace(/_/g, " ");

  return `${input.teamName} ${typeLabel} compliance`;
}

export function buildRuleIssueMessage(finding: RuleResult) {
  return finding.message;
}

export function buildDeadlineIssueTitle(input: {
  deadlineType: string;
  overdue: boolean;
}) {
  const label = input.deadlineType
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

  return input.overdue ? `${label} deadline missed` : `${label} deadline approaching`;
}

export function buildDeadlineIssueMessage(input: {
  deadlineType: string;
  scheduledAt: Date;
  overdue: boolean;
  phase: string;
}) {
  const label = input.deadlineType.trim().replace(/[_-]+/g, " ");
  const dueText = input.scheduledAt.toISOString();
  if (input.overdue) {
    return `${label} deadline for ${input.phase} passed at ${dueText}.`;
  }

  return `${label} deadline for ${input.phase} is scheduled at ${dueText}.`;
}
