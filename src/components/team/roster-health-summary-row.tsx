import type { TeamCapDetailProjection } from "@/types/detail";

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toLocaleString()}`;
}

export function RosterHealthSummaryRow(props: {
  detail: TeamCapDetailProjection;
  testId?: string;
}) {
  const expiringContractsCount = props.detail.contracts.filter(
    (contract) => contract.status === "EXPIRING" || contract.yearsRemaining <= 1,
  ).length;

  const optionCandidatesCount = props.detail.contracts.filter(
    (contract) => contract.rookieOptionEligible && !contract.rookieOptionExercised,
  ).length;

  const totalActionItems = 
    expiringContractsCount + 
    optionCandidatesCount + 
    props.detail.complianceSummary.openIssueCount;

  return (
    <div className="shell-panel" data-testid={props.testId}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-slate-500">Roster Count</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {props.detail.roster.starters.length + 
             props.detail.roster.bench.length + 
             props.detail.roster.injuredReserve.length + 
             props.detail.roster.taxi.length}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Track roster utilization and cap allocation
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-slate-500">Cap Room</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {formatMoney(props.detail.capSummary.capSpaceHard)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {props.detail.capSummary.capSpaceHard && props.detail.capSummary.capSpaceHard < 1000000 
              ? "Limited flexibility for moves"
              : "Available for roster improvements"}
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <p className="text-sm text-slate-500">Decision Queue</p>
          <p className={`mt-1 text-2xl font-semibold ${
            totalActionItems > 5 ? "text-amber-400" : "text-slate-100"
          }`}>
            {totalActionItems}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {totalActionItems === 0 
              ? "All decisions current" 
              : totalActionItems > 5
              ? "High volume needs attention"
              : "Routine decisions pending"}
          </p>
        </div>

        <div className={`rounded-lg border p-4 ${
          props.detail.complianceSummary.openIssueCount === 0
            ? "border-slate-800 bg-slate-900/60"
            : "border-amber-700/40 bg-amber-950/15"
        }`}>
          <p className="text-sm text-slate-500">Compliance Status</p>
          <p className={`mt-1 text-2xl font-semibold ${
            props.detail.complianceSummary.openIssueCount === 0 
              ? "text-green-400" 
              : "text-amber-400"
          }`}>
            {props.detail.complianceSummary.openIssueCount === 0 ? "Clear" : "Issues"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {props.detail.complianceSummary.openIssueCount === 0 
              ? "All league rules satisfied"
              : "Action required before deadlines"
            }
          </p>
        </div>
      </div>
    </div>
  );
}