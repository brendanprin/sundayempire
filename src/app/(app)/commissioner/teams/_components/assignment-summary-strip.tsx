type LeagueStats = {
  totalTeams: number;
  assignedTeams: number;
  unassignedTeams: number;
  membersWithoutTeam: number;
  pendingInvites: number;
};

export function AssignmentSummaryStrip({ stats }: { stats: LeagueStats }) {
  const needsAttention =
    stats.unassignedTeams > 0 || stats.membersWithoutTeam > 0 || stats.pendingInvites > 0;
  const isEmpty = stats.totalTeams === 0;

  return (
    <div
      data-testid="assignment-summary-strip"
      className={`rounded-lg border px-4 py-3 ${
        needsAttention
          ? "border-amber-800/50 bg-amber-950/10"
          : "border-emerald-800/40 bg-emerald-950/10"
      }`}
    >
      <div className="mb-3 flex items-center gap-2">
        {needsAttention ? (
          <>
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <p className="text-xs font-medium text-amber-400">Needs attention</p>
          </>
        ) : isEmpty ? (
          <>
            <span className="h-2 w-2 rounded-full bg-slate-600" />
            <p className="text-xs font-medium text-slate-500">No franchises set up yet</p>
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <p className="text-xs font-medium text-emerald-400">Fully staffed</p>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        <div>
          <p className="text-xs text-slate-500">Total Teams</p>
          <p className="mt-0.5 text-xl font-semibold text-slate-100" data-testid="summary-total-teams">
            {stats.totalTeams}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Assigned</p>
          <p className="mt-0.5 text-xl font-semibold text-slate-100" data-testid="summary-assigned-teams">
            {stats.assignedTeams}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Unassigned</p>
          <p
            className={`mt-0.5 text-xl font-semibold ${stats.unassignedTeams > 0 ? "text-amber-400" : "text-slate-100"}`}
            data-testid="summary-unassigned-teams"
          >
            {stats.unassignedTeams}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Without Team</p>
          <p
            className={`mt-0.5 text-xl font-semibold ${stats.membersWithoutTeam > 0 ? "text-amber-400" : "text-slate-100"}`}
            data-testid="summary-members-without-team"
          >
            {stats.membersWithoutTeam}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Pending Invites</p>
          <p className="mt-0.5 text-xl font-semibold text-slate-100" data-testid="summary-pending-invites">
            {stats.pendingInvites}
          </p>
        </div>
      </div>
    </div>
  );
}
