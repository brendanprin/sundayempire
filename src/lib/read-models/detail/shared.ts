import {
  ComplianceIssueSeverity,
  ComplianceIssueStatus,
  Contract,
  ContractOptionDecision,
  ContractSeasonLedger,
  ContractStatus,
  DeadCapCharge,
  FranchiseTagUsage,
  RosterAssignment,
  TeamSlotType,
} from "@prisma/client";
import { resolveContractStatus } from "@/lib/domain/contracts/shared";
import {
  isOpenIssueStatus,
  summarizeIssueSeverities,
} from "@/lib/read-models/dashboard/shared";
import { DetailIssueItem, DetailIssueSummary } from "@/lib/read-models/detail/types";

type IssueSummaryInput = {
  severity: ComplianceIssueSeverity;
  dueAt: Date | null;
  status: ComplianceIssueStatus;
}[];

type IssueItemInput = {
  id: string;
  severity: ComplianceIssueSeverity;
  status: ComplianceIssueStatus;
  code: string;
  title: string;
  dueAt: Date | null;
}[];

type ContractProjectionInput = Pick<
  Contract,
  | "id"
  | "status"
  | "salary"
  | "yearsTotal"
  | "yearsRemaining"
  | "startYear"
  | "endYear"
  | "endedAt"
  | "isRookieContract"
  | "rookieOptionEligible"
  | "rookieOptionExercised"
  | "isFranchiseTag"
> & {
  seasonLedgers: Pick<
    ContractSeasonLedger,
    "annualSalary" | "yearsRemainingAtStart" | "ledgerStatus"
  >[];
  franchiseTagUsages: Pick<
    FranchiseTagUsage,
    "id" | "finalTagSalary" | "priorSalary"
  >[];
  optionDecisions: Pick<
    ContractOptionDecision,
    "id" | "decisionType" | "effectiveContractYearsAdded" | "decidedAt"
  >[];
};

type ContractSelectionInput = Pick<
  Contract,
  | "id"
  | "status"
  | "yearsRemaining"
  | "isFranchiseTag"
  | "endedAt"
  | "updatedAt"
  | "createdAt"
>;

const CONTRACT_STATUS_PRIORITY: Record<ContractStatus, number> = {
  TAGGED: 0,
  ACTIVE: 1,
  EXPIRING: 2,
  TERMINATED: 3,
  EXPIRED: 4,
};

function rankIssueSeverity(severity: ComplianceIssueSeverity) {
  switch (severity) {
    case "CRITICAL":
      return 0;
    case "ERROR":
      return 1;
    case "WARNING":
      return 2;
    default:
      return 3;
  }
}

export function buildDetailIssueSummary(
  issues: IssueSummaryInput,
  now: Date,
): DetailIssueSummary {
  const openIssues = issues.filter((issue) => isOpenIssueStatus(issue.status));
  const summary = summarizeIssueSeverities(
    openIssues.map((issue) => ({
      severity: issue.severity,
      dueAt: issue.dueAt,
    })),
    now,
  );

  return {
    openIssueCount: summary.openIssueCount,
    overdueIssueCount: summary.overdueCount,
    warningCount: summary.warningCount,
    errorCount: summary.errorCount,
    criticalCount: summary.criticalCount,
    highestSeverity: summary.highestSeverity,
  };
}

export function buildTopIssueItems(
  issues: IssueItemInput,
  now: Date,
  limit = 5,
): DetailIssueItem[] {
  return issues
    .filter((issue) => isOpenIssueStatus(issue.status))
    .sort((left, right) => {
      const overdueLeft = left.dueAt ? left.dueAt.getTime() < now.getTime() : false;
      const overdueRight = right.dueAt ? right.dueAt.getTime() < now.getTime() : false;
      if (overdueLeft !== overdueRight) {
        return overdueLeft ? -1 : 1;
      }

      const severityDelta = rankIssueSeverity(left.severity) - rankIssueSeverity(right.severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      const dueAtDelta = (left.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
        - (right.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER);
      if (dueAtDelta !== 0) {
        return dueAtDelta;
      }

      return left.title.localeCompare(right.title);
    })
    .slice(0, Math.max(1, limit))
    .map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      status: issue.status,
      code: issue.code,
      title: issue.title,
      dueAt: issue.dueAt?.toISOString() ?? null,
    }));
}

export function mapTeamContractSummary(contract: ContractProjectionInput) {
  const resolvedStatus = resolveContractStatus({
    status: contract.status,
    yearsRemaining: contract.yearsRemaining,
    isFranchiseTag: contract.isFranchiseTag,
    endedAt: contract.endedAt,
  });

  const ledger = contract.seasonLedgers[0] ?? null;
  const tagUsage = contract.franchiseTagUsages[0] ?? null;
  const optionDecision = contract.optionDecisions[0] ?? null;

  return {
    id: contract.id,
    status: resolvedStatus,
    salary: contract.salary,
    yearsTotal: contract.yearsTotal,
    yearsRemaining: contract.yearsRemaining,
    startYear: contract.startYear,
    endYear: contract.endYear,
    endedAt: contract.endedAt?.toISOString() ?? null,
    isRookieContract: contract.isRookieContract,
    rookieOptionEligible: contract.rookieOptionEligible,
    rookieOptionExercised: contract.rookieOptionExercised,
    isFranchiseTag: contract.isFranchiseTag,
    ledger: ledger
      ? {
          annualSalary: ledger.annualSalary,
          yearsRemainingAtStart: ledger.yearsRemainingAtStart,
          ledgerStatus: ledger.ledgerStatus,
        }
      : null,
    franchiseTagUsage: tagUsage
      ? {
          id: tagUsage.id,
          finalTagSalary: tagUsage.finalTagSalary,
          priorSalary: tagUsage.priorSalary,
        }
      : null,
    optionDecision: optionDecision
      ? {
          id: optionDecision.id,
          decisionType: optionDecision.decisionType,
          effectiveContractYearsAdded: optionDecision.effectiveContractYearsAdded,
          decidedAt: optionDecision.decidedAt?.toISOString() ?? null,
        }
      : null,
  };
}

export function selectPreferredContract<T extends ContractSelectionInput>(contracts: T[]) {
  return [...contracts].sort((left, right) => {
    const resolvedLeft = resolveContractStatus({
      status: left.status,
      yearsRemaining: left.yearsRemaining,
      isFranchiseTag: left.isFranchiseTag,
      endedAt: left.endedAt,
    });
    const resolvedRight = resolveContractStatus({
      status: right.status,
      yearsRemaining: right.yearsRemaining,
      isFranchiseTag: right.isFranchiseTag,
      endedAt: right.endedAt,
    });

    const priorityDelta =
      CONTRACT_STATUS_PRIORITY[resolvedLeft] - CONTRACT_STATUS_PRIORITY[resolvedRight];
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    const updatedAtDelta = right.updatedAt.getTime() - left.updatedAt.getTime();
    if (updatedAtDelta !== 0) {
      return updatedAtDelta;
    }

    return right.createdAt.getTime() - left.createdAt.getTime();
  })[0] ?? null;
}

export function calculateDeadCapEffectiveAmount(
  charge: Pick<DeadCapCharge, "systemCalculatedAmount" | "adjustedAmount">,
) {
  return charge.adjustedAmount ?? charge.systemCalculatedAmount;
}

export function sortRosterSlots<T extends { slotType: TeamSlotType; slotLabel: string | null; player: { name: string } }>(
  slots: T[],
) {
  return [...slots].sort((left, right) => {
    const slotTypeDelta =
      rosterSlotTypeRank(left.slotType) - rosterSlotTypeRank(right.slotType);
    if (slotTypeDelta !== 0) {
      return slotTypeDelta;
    }

    const labelDelta = compareNullableStrings(left.slotLabel, right.slotLabel);
    if (labelDelta !== 0) {
      return labelDelta;
    }

    return left.player.name.localeCompare(right.player.name);
  });
}

export function buildRosterAssignmentLookup<T extends Pick<RosterAssignment, "playerId" | "endedAt">>(
  assignments: T[],
) {
  const lookup = new Map<string, T>();

  for (const assignment of assignments) {
    if (assignment.endedAt) {
      continue;
    }

    if (!lookup.has(assignment.playerId)) {
      lookup.set(assignment.playerId, assignment);
    }
  }

  return lookup;
}

function rosterSlotTypeRank(slotType: TeamSlotType) {
  switch (slotType) {
    case "STARTER":
      return 0;
    case "BENCH":
      return 1;
    case "IR":
      return 2;
    case "TAXI":
      return 3;
    default:
      return 4;
  }
}

function compareNullableStrings(left: string | null, right: string | null) {
  return (left ?? "").localeCompare(right ?? "");
}
