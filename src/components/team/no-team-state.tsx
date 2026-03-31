"use client";

type NoTeamStateProps = {
  openTeamsCount: number;
  onViewOpenTeams: () => void;
};

export function NoTeamState({ openTeamsCount, onViewOpenTeams }: NoTeamStateProps) {
  return (
    <div
      className="rounded-xl border p-6 space-y-5"
      style={{
        borderColor: "rgb(30, 58, 138)",
        backgroundColor: "rgba(15, 23, 42, 0.6)",
      }}
      data-testid="no-team-onboarding-banner"
    >
      {/* Header */}
      <div className="flex items-start gap-4">
        <div
          className="flex-shrink-0 rounded-lg p-2.5"
          style={{ backgroundColor: "rgba(30, 58, 138, 0.5)" }}
        >
          <svg
            className="h-5 w-5"
            style={{ color: "rgb(96, 165, 250)" }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "rgb(191, 219, 254)" }}>
            You don&apos;t have a team assigned yet
          </p>
          <p className="mt-1 text-sm" style={{ color: "rgb(147, 197, 253)" }}>
            You&apos;re a member of this league but your commissioner hasn&apos;t assigned you a
            franchise yet.
          </p>
        </div>
      </div>

      {/* Steps */}
      <div
        className="rounded-lg border divide-y divide-[rgba(30,58,138,0.4)]"
        style={{
          borderColor: "rgba(30, 58, 138, 0.6)",
          backgroundColor: "rgba(15, 23, 42, 0.4)",
        }}
      >
        {/* Step 1 */}
        <div className="flex items-start gap-3 px-4 py-3">
          <span
            className="flex-shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: "rgba(30, 58, 138, 0.7)",
              color: "rgb(96, 165, 250)",
            }}
          >
            1
          </span>
          <div>
            <p className="text-sm font-medium" style={{ color: "rgb(191, 219, 254)" }}>
              Request a team from your commissioner
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "rgb(147, 197, 253)" }}>
              Your commissioner assigns franchises through{" "}
              <span style={{ color: "rgb(96, 165, 250)" }}>Commissioner → Teams</span>. Reach out
              to them directly to get a team assigned to your account.
            </p>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex items-start gap-3 px-4 py-3">
          <span
            className="flex-shrink-0 mt-0.5 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
            style={{
              backgroundColor: "rgba(30, 58, 138, 0.7)",
              color: "rgb(96, 165, 250)",
            }}
          >
            2
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "rgb(191, 219, 254)" }}>
              Browse available franchises
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "rgb(147, 197, 253)" }}>
              {openTeamsCount > 0
                ? `${openTeamsCount} franchise${openTeamsCount === 1 ? "" : "s"} in this league currently have no owner.`
                : "Review the franchise directory to see team rosters and history before your assignment."}
            </p>
            <button
              type="button"
              onClick={onViewOpenTeams}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition hover:opacity-80"
              style={{
                borderColor: "rgba(30, 58, 138, 0.8)",
                color: "rgb(96, 165, 250)",
                backgroundColor: "rgba(30, 58, 138, 0.3)",
              }}
              data-testid="view-open-teams-button"
            >
              {openTeamsCount > 0 ? `View ${openTeamsCount} open team${openTeamsCount === 1 ? "" : "s"}` : "View league teams"}
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
