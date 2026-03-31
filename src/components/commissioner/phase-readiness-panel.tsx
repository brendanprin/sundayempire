"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { Button } from "@/components/ui/button";

type PhaseReadinessData = {
  league: {
    league: { id: string; name: string };
    season: {
      phase: "PRESEASON" | "REGULAR_SEASON" | "PLAYOFFS" | "OFFSEASON";
      year: number;
      regularSeasonWeeks: number;
      playoffStartWeek: number;
      playoffEndWeek: number;
    };
  } | null;
  teams: Array<{
    id: string;
    name: string;
    complianceStatus: "ok" | "warning" | "error";
  }>;
};

type PhaseReadinessActions = {
  onPhaseTransition: (phase: "PRESEASON" | "REGULAR_SEASON" | "PLAYOFFS" | "OFFSEASON") => Promise<void>;
  busyAction: string | null;
};

const PHASE_TRANSITIONS = {
  PRESEASON: "REGULAR_SEASON",
  REGULAR_SEASON: "PLAYOFFS",
  PLAYOFFS: "OFFSEASON",
  OFFSEASON: "PRESEASON",
} as const;

const PHASE_READINESS_CHECKS = {
  PRESEASON: [
    "All teams have complete rosters",
    "Draft setup is complete",
    "Waiver processing is configured",
    "No blocking compliance issues",
  ],
  REGULAR_SEASON: [
    "Regular season games are configured",
    "Lineup requirements are met",
    "Trade window is active",
    "No blocking compliance issues",
  ],
  PLAYOFFS: [
    "Playoff bracket is set",
    "Trade deadline has passed",
    "Roster locks are configured",
    "No blocking compliance issues",
  ],
  OFFSEASON: [
    "Season completion is confirmed",
    "Contract renewals are processed",
    "Draft order is determined",
    "Rollover preparation is complete",
  ],
} as const;

export function PhaseReadinessPanel(props: {
  data: PhaseReadinessData;
  actions: PhaseReadinessActions;
  testId?: string;
}) {
  const { league, teams } = props.data;

  if (!league) {
    return (
      <section id="phase-readiness" className="scroll-mt-24" data-testid={props.testId}>
        <DashboardCard title="Phase Readiness" description="Loading league phase information...">
          <div />
        </DashboardCard>
      </section>
    );
  }

  const currentPhase = league.season.phase;
  const nextPhase = PHASE_TRANSITIONS[currentPhase];
  const readinessChecks = PHASE_READINESS_CHECKS[currentPhase];
  const blockingTeams = teams.filter(team => team.complianceStatus === "error").length;
  const isReadyForTransition = blockingTeams === 0;

  return (
    <section id="phase-readiness" className="scroll-mt-24" data-testid={props.testId}>
      <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Phase Readiness
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-100">
              {formatLeaguePhaseLabel(currentPhase)}
              <span className="ml-2 text-xs font-normal text-slate-400">
                Season {league.season.year}
              </span>
            </p>
          </div>

          {isReadyForTransition ? (
            <span className="rounded-full bg-emerald-800/70 px-3 py-1 text-xs font-semibold text-emerald-200">
              Ready to Advance
            </span>
          ) : (
            <span className="rounded-full bg-red-700 px-3 py-1 text-xs font-bold text-white">
              TRANSITION BLOCKED
            </span>
          )}
        </div>

        {/* Blocked warning banner */}
        {!isReadyForTransition && (
          <div className="mt-3 flex items-center gap-3 rounded-md border border-red-600/60 bg-red-950/50 px-3 py-2">
            <svg className="h-4 w-4 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <p className="text-xs font-medium text-red-200">
              Cannot advance to {formatLeaguePhaseLabel(nextPhase)} —{" "}
              <span className="font-bold text-red-100">
                {blockingTeams} team{blockingTeams === 1 ? "" : "s"} have blocking compliance issues
              </span>
            </p>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Next Phase */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Next Phase</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {formatLeaguePhaseLabel(nextPhase)}
            </p>
            {!isReadyForTransition && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-red-300">
                  Resolve {blockingTeams} blocking team{blockingTeams === 1 ? "" : "s"} first
                </p>
                <Link
                  href="#urgent-queue"
                  className="inline-flex text-xs font-medium text-red-400 hover:text-red-300"
                >
                  View blocking issues ↑
                </Link>
              </div>
            )}
          </div>

          {/* Schedule Reference */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Schedule Reference
            </p>
            <div className="mt-2 space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Regular Season</span>
                <span>{league.season.regularSeasonWeeks} weeks</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Playoffs</span>
                <span>Weeks {league.season.playoffStartWeek}–{league.season.playoffEndWeek}</span>
              </div>
            </div>
            <div className="mt-3">
              <Link
                href="/rules"
                className="inline-flex text-xs text-sky-400 hover:text-sky-300"
                data-testid="phase-rules-link"
              >
                Review Deadlines &amp; Rules →
              </Link>
            </div>
          </div>
        </div>

        {/* Readiness Checklist */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Readiness Checklist
          </h4>
          <div className="mt-2 grid gap-1.5 md:grid-cols-2">
            {readinessChecks.map((check, index) => {
              const isCheckPassed = check.includes("compliance") ? isReadyForTransition : true;

              return (
                <div
                  key={index}
                  className={`flex items-center gap-3 rounded border px-3 py-2 ${
                    isCheckPassed
                      ? "border-slate-800 bg-slate-950/60"
                      : "border-red-800/60 bg-red-950/40"
                  }`}
                >
                  <div
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      isCheckPassed ? "bg-emerald-500" : "bg-red-500"
                    }`}
                  />
                  <span
                    className={`text-xs ${
                      isCheckPassed ? "text-slate-300" : "font-medium text-red-200"
                    }`}
                  >
                    {check}
                  </span>
                  {!isCheckPassed && (
                    <span className="ml-auto shrink-0 rounded-full bg-red-800 px-1.5 py-0.5 text-[10px] font-bold text-red-100">
                      BLOCKED
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase Transition — milestone CTA, only surfaces when all checks pass */}
        {isReadyForTransition ? (
          <div className="mt-5 rounded-xl border border-emerald-600/60 bg-emerald-950/20 p-5 ring-1 ring-emerald-600/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Phase Transition Ready
                </p>
                <p className="mt-1 text-base font-semibold text-emerald-100">
                  Advance to {formatLeaguePhaseLabel(nextPhase)}
                </p>
                <p className="mt-0.5 text-sm text-emerald-300/70">
                  League-wide milestone — all readiness checks passed
                </p>
              </div>
              <Button
                type="button"
                onClick={() => props.actions.onPhaseTransition(nextPhase)}
                disabled={props.actions.busyAction !== null}
                variant="primary"
                size="lg"
                data-testid="phase-transition-button"
              >
                {props.actions.busyAction === `phase:${nextPhase}`
                  ? "Transitioning…"
                  : `Advance to ${formatLeaguePhaseLabel(nextPhase)} →`}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-red-800/40 bg-red-950/10 px-4 py-3">
            <p className="text-xs text-red-300">
              Phase transition is locked until all blocking compliance issues are resolved.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
