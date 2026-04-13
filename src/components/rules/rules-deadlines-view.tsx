"use client";

import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { PhaseBadge } from "@/components/dashboard/phase-badge";
import { FormState, RulesFieldGroup } from "@/components/rules/rules-form-types";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type { RulesDeadlinesProjection } from "@/types/detail";
import { Button } from "@/components/ui/button";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString();
}

function plainLanguageRules(detail: RulesDeadlinesProjection) {
  if (!detail.ruleset) {
    return [];
  }

  return [
    {
      title: "Roster and lineup",
      summary: `Managers carry ${detail.ruleset.rosterSize} roster spots with ${detail.ruleset.starterQb} QB, ${detail.ruleset.starterRb} RB, ${detail.ruleset.starterWr} WR, ${detail.ruleset.starterTe} TE, ${detail.ruleset.starterFlex} flex, ${detail.ruleset.starterDst} DST, and ${detail.ruleset.irSlots} IR spots.`,
    },
    {
      title: "Cap and contract window",
      summary: `The active cap range is $${detail.ruleset.salaryCapSoft} soft to $${detail.ruleset.salaryCapHard} hard, with ${detail.ruleset.minContractYears}-${detail.ruleset.maxContractYears} year contracts and a $${detail.ruleset.minSalary} minimum salary.`,
    },
    {
      title: "Tags and rookie options",
      summary: `Teams can use ${detail.ruleset.franchiseTagsPerTeam} franchise tag${detail.ruleset.franchiseTagsPerTeam === 1 ? "" : "s"} and rookie options add ${detail.ruleset.rookieOptionYears} season${detail.ruleset.rookieOptionYears === 1 ? "" : "s"} after the base rookie term.`,
    },
    {
      title: "Trade and playoff calendar",
      summary: `Trades close after week ${detail.ruleset.tradeDeadlineWeek}, the regular season runs ${detail.ruleset.regularSeasonWeeks} week${detail.ruleset.regularSeasonWeeks === 1 ? "" : "s"}, and playoffs span weeks ${detail.ruleset.playoffStartWeek}-${detail.ruleset.playoffEndWeek}.`,
    },
  ];
}

function buildManagerGuidance(detail: RulesDeadlinesProjection) {
  const nextDeadline =
    detail.deadlines.currentPhaseDeadlines[0] ?? detail.deadlines.upcomingDeadlines[0] ?? null;
  const items = [
    detail.lifecycle.currentPhase
      ? `League is currently in ${formatLeaguePhaseLabel(detail.lifecycle.currentPhase)}.`
      : "League phase is unresolved, so deadline and rule timing should be treated cautiously.",
    nextDeadline
      ? `Next deadline: ${formatEnumLabel(nextDeadline.deadlineType)} on ${formatDateTime(nextDeadline.scheduledAt)}.`
      : "No active deadlines are configured right now.",
  ];

  if (detail.deadlines.summary.overdueCount > 0) {
    items.push(
      `${detail.deadlines.summary.overdueCount} deadline${detail.deadlines.summary.overdueCount === 1 ? "" : "s"} already need attention.`,
    );
  } else if (detail.deadlines.summary.currentPhaseCount > 0) {
    items.push(
      `${detail.deadlines.summary.currentPhaseCount} deadline${detail.deadlines.summary.currentPhaseCount === 1 ? "" : "s"} fall inside the current phase.`,
    );
  }

  if (detail.ruleset) {
    items.push(
      `Plan around the $${detail.ruleset.salaryCapSoft} soft cap, $${detail.ruleset.salaryCapHard} hard cap, and trade deadline in week ${detail.ruleset.tradeDeadlineWeek}.`,
    );
  }

  return items;
}

function mergeVisibleDeadlines(detail: RulesDeadlinesProjection) {
  const byId = new Map<string, RulesDeadlinesProjection["deadlines"]["upcomingDeadlines"][number]>();

  detail.deadlines.currentPhaseDeadlines.forEach((deadline) => {
    byId.set(deadline.id, deadline);
  });
  detail.deadlines.upcomingDeadlines.forEach((deadline) => {
    byId.set(deadline.id, deadline);
  });

  return Array.from(byId.values());
}

function deadlineTone(deadline: RulesDeadlinesProjection["deadlines"]["upcomingDeadlines"][number]) {
  if (deadline.overdue) {
    return "border-red-700/50 bg-red-950/30 text-red-100";
  }
  if (deadline.urgency === "today") {
    return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  }
  return "border-slate-700 bg-slate-900 text-slate-200";
}

export function RulesDeadlinesView(props: {
  detail: RulesDeadlinesProjection;
  fieldGroups: RulesFieldGroup[];
  form: FormState | null;
  canEdit: boolean;
  busy: boolean;
  error: string | null;
  message: string | null;
  onFormChange: (field: keyof FormState, value: string) => void;
  onSave: () => Promise<void> | void;
}) {
  const phaseLabel = formatLeaguePhaseLabel(props.detail.lifecycle.currentPhase);
  const currentPhase = props.detail.lifecycle.currentPhase
    ? formatLeaguePhaseLabel(props.detail.lifecycle.currentPhase)
    : "Unresolved";
  const isSeasonLocked = ["REGULAR_SEASON", "PLAYOFFS"].includes(
    props.detail.lifecycle.currentPhase ?? "",
  );
  const nextPhase = props.detail.lifecycle.nextPhase
    ? formatLeaguePhaseLabel(props.detail.lifecycle.nextPhase)
    : "None scheduled";
  const visibleDeadlines = mergeVisibleDeadlines(props.detail);
  const nextDeadline = visibleDeadlines[0] ?? null;
  const rulesSummary = plainLanguageRules(props.detail);
  const managerGuidance = buildManagerGuidance(props.detail);

  return (
    <div className="space-y-6" data-testid="rules-deadlines-view">

      {props.error ? (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {props.error}
        </div>
      ) : null}

      {props.message ? (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">
          {props.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Current Phase" eyebrow="League lifecycle" testId="rules-summary-current-phase">
          <p className="text-2xl font-semibold text-slate-100">{currentPhase}</p>
          <p className="mt-2 text-sm text-slate-400">Next phase: {nextPhase}</p>
        </DashboardCard>
        <DashboardCard title="Next Deadline" eyebrow="Time-sensitive" testId="rules-summary-next-deadline">
          <p className="text-lg font-semibold text-slate-100">
            {nextDeadline ? formatEnumLabel(nextDeadline.deadlineType) : "None scheduled"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {nextDeadline ? formatDateTime(nextDeadline.scheduledAt) : "No active deadline is available."}
          </p>
        </DashboardCard>
        <DashboardCard
          title="Current-Phase Deadlines"
          eyebrow="Manager attention"
          testId="rules-summary-current-phase-deadlines"
        >
          <p className="text-3xl font-semibold text-slate-100">
            {props.detail.deadlines.summary.currentPhaseCount}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Overdue: {props.detail.deadlines.summary.overdueCount}
          </p>
        </DashboardCard>
        <DashboardCard title="Active Ruleset" eyebrow="Version" testId="rules-summary-ruleset">
          <p className="text-3xl font-semibold text-slate-100">
            {props.detail.ruleset ? `v${props.detail.ruleset.version}` : "-"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {props.detail.ruleset
              ? "Increments each time rules are saved."
              : "No active ruleset is available."}
          </p>
          {props.detail.ruleset ? (
            <p className="mt-1 text-xs text-slate-500">
              Last modified {formatDateTime(props.detail.ruleset.updatedAt)}
            </p>
          ) : null}
          {isSeasonLocked ? (
            <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-amber-700/50 bg-amber-950/30 px-2 py-0.5 text-[11px] font-medium text-amber-300" data-testid="rules-season-lock-chip">
              Frozen — {currentPhase}
            </span>
          ) : null}
        </DashboardCard>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <DashboardCard
            title="Current phase summary"
            eyebrow="What matters now"
            description="The league phase and blockers that should shape near-term manager decisions."
            testId="rules-phase-summary"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Current phase</p>
                <p className="mt-2 text-lg font-semibold text-slate-100">{currentPhase}</p>
                <p className="mt-2 text-sm text-slate-400">Next phase: {nextPhase}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-500">Recent transition</p>
                {props.detail.lifecycle.recentTransitions[0] ? (
                  <>
                    <p className="mt-2 text-sm font-medium text-slate-100">
                      {formatLeaguePhaseLabel(props.detail.lifecycle.recentTransitions[0].fromPhase)} to{" "}
                      {formatLeaguePhaseLabel(props.detail.lifecycle.recentTransitions[0].toPhase)}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDateTime(props.detail.lifecycle.recentTransitions[0].occurredAt)}
                    </p>
                    {props.detail.lifecycle.recentTransitions[0].reason ? (
                      <p className="mt-2 text-sm text-slate-300">
                        {props.detail.lifecycle.recentTransitions[0].reason}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">No recent phase transition is recorded.</p>
                )}
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Lifecycle blockers</p>
              {props.detail.lifecycle.blockers.length === 0 ? (
                <p className="text-sm text-slate-400">No lifecycle blockers are recorded for the current phase.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {props.detail.lifecycle.blockers.map((blocker) => (
                    <li
                      key={blocker.code}
                      className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-amber-100"
                    >
                      <p className="font-medium">{blocker.code}</p>
                      <p className="mt-1 text-xs text-amber-50/80">{blocker.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Upcoming deadlines"
            eyebrow="Time-sensitive items"
            description="Current-phase deadlines appear first so managers can see what needs attention soonest."
            testId="rules-upcoming-deadlines"
          >
            {visibleDeadlines.length === 0 ? (
              <p className="text-sm text-slate-400">
                No deadlines are configured for the active league context. Check back after the next lifecycle update or ask the commissioner to confirm the deadline schedule.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {visibleDeadlines.map((deadline) => (
                  <li key={deadline.id} className="rounded-md border border-slate-800/80 px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-100">{formatEnumLabel(deadline.deadlineType)}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatLeaguePhaseLabel(deadline.phase)} · {formatDateTime(deadline.scheduledAt)}
                        </p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${deadlineTone(deadline)}`}>
                        {deadline.overdue ? "Overdue" : deadline.urgency === "today" ? "Due today" : "Upcoming"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DashboardCard>

          <DashboardCard
            title="Plain-language rule summary"
            eyebrow="Manager reference"
            description="High-signal policy points to review before making contract, cap, or trade decisions."
            testId="rules-plain-language-summary"
          >
            {rulesSummary.length === 0 ? (
              <p className="text-sm text-slate-400">
                No active ruleset is available for plain-language guidance. Manager decisions should pause until a current ruleset is restored.
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {rulesSummary.map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-2 text-sm text-slate-300">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>

        <div className="space-y-6">
          <DashboardCard
            title="Manager guidance"
            eyebrow="Operational focus"
            description="What to review before heading back into roster, trade, or draft workflows."
            testId="rules-manager-guidance"
          >
            <ul className="space-y-2 text-sm text-slate-300">
              {managerGuidance.map((item) => (
                <li key={item} className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </DashboardCard>

          <DashboardCard
            title="Rules version history"
            eyebrow="Reference information"
            description="Historical context remains available without competing with active operating guidance."
          >
            <ul className="space-y-2 text-sm">
              {props.detail.history.map((item) => (
                <li key={item.id} className="rounded-md border border-slate-800/80 px-3 py-3">
                  <p className="font-medium text-slate-100">
                    v{item.version} {item.isActive ? "· Active" : ""}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Effective {formatDateTime(item.effectiveAt)}
                  </p>
                  {item.notes ? <p className="mt-1 text-xs text-slate-300">{item.notes}</p> : null}
                </li>
              ))}
              {props.detail.history.length === 0 ? (
                <li className="text-slate-500">No ruleset history available.</li>
              ) : null}
            </ul>
          </DashboardCard>

          {props.canEdit ? (
            <DashboardCard
              title="Commissioner tools"
              eyebrow="Secondary controls"
              description="Versioned rule editing remains available for commissioners, but separate from the manager-first operating guide."
              testId="rules-commissioner-tools"
            >
              {props.form ? (
                <div className="space-y-4">
                  {isSeasonLocked ? (
                    <div
                      className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200"
                      data-testid="rules-season-lock-banner"
                    >
                      <p className="font-medium text-amber-100">Rules frozen — {currentPhase} is active</p>
                      <p className="mt-1 text-xs text-amber-200/80">
                        Rule changes during an active season take effect next offseason. Save with care.
                      </p>
                    </div>
                  ) : null}
                  {props.fieldGroups.map((group, index) => (
                    <details key={group.title} className="rounded-lg border border-slate-800 bg-slate-900/60" open={index === 0}>
                      <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold text-slate-100 hover:text-slate-50 [&::-webkit-details-marker]:hidden">
                        {group.title}
                        <span className="text-xs font-normal text-slate-500 group-open:hidden">
                          {group.fields.length} fields
                        </span>
                      </summary>
                      <div className="grid gap-3 px-4 pb-4">
                        {group.fields.map((field) => (
                          <label key={field.key} className="space-y-1 text-xs text-slate-400">
                            <span>{field.label}</span>
                            <input
                              type={field.type === "text" ? "text" : "number"}
                              min={field.type === "text" ? undefined : 0}
                              value={props.form?.[field.key] ?? ""}
                              onChange={(event) => props.onFormChange(field.key, event.target.value)}
                              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                            />
                          </label>
                        ))}
                      </div>
                    </details>
                  ))}
                  <Button
                    type="button"
                    onClick={() => void props.onSave()}
                    disabled={props.busy}
                    variant="primary"
                    className="w-full"
                    loading={props.busy}
                  >
                    {props.busy ? "Saving..." : "Save New Rules Version"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-slate-400">Rules editing is unavailable until an active ruleset is loaded.</p>
              )}
            </DashboardCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}
