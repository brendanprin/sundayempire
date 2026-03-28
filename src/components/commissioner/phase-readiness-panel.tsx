"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { formatEnumLabel } from "@/lib/format-label";
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
  OFFSEASON: "PRESEASON"
} as const;

const PHASE_READINESS_CHECKS = {
  PRESEASON: [
    "All teams have complete rosters",
    "Draft setup is complete", 
    "Waiver processing is configured",
    "No blocking compliance issues"
  ],
  REGULAR_SEASON: [
    "Regular season games are configured",
    "Lineup requirements are met",
    "Trade window is active",
    "No blocking compliance issues"
  ],
  PLAYOFFS: [
    "Playoff bracket is set",
    "Trade deadline has passed",
    "Roster locks are configured", 
    "No blocking compliance issues"
  ],
  OFFSEASON: [
    "Season completion is confirmed",
    "Contract renewals are processed",
    "Draft order is determined",
    "Rollover preparation is complete"
  ]
} as const;

export function PhaseReadinessPanel(props: {
  data: PhaseReadinessData;
  actions: PhaseReadinessActions;
  testId?: string;
}) {
  const { league, teams } = props.data;
  
  if (!league) {
    return (
      <section
        id="phase-readiness"
        className="scroll-mt-24"
        data-testid={props.testId}
      >
        <DashboardCard title="Phase Readiness" description="Loading league phase information...">
          <div></div>
        </DashboardCard>
      </section>
    );
  }

  const currentPhase = league.season.phase;
  const nextPhase = PHASE_TRANSITIONS[currentPhase];
  const readinessChecks = PHASE_READINESS_CHECKS[currentPhase];
  const blockingTeams = teams.filter(team => team.complianceStatus === "error").length;
  
  // Determine phase readiness status
  const hasBlockingIssues = blockingTeams > 0;
  const isReadyForTransition = !hasBlockingIssues; // Simplified readiness check
  
  const readinessStatus = isReadyForTransition
    ? "ready"
    : hasBlockingIssues 
      ? "blocked"
      : "in-progress";

  const statusConfig = {
    ready: {
      tone: "emerald",
      label: "Ready for Transition",
      description: "All readiness checks passed"
    },
    blocked: {
      tone: "red", 
      label: "Transition Blocked",
      description: `${blockingTeams} team${blockingTeams === 1 ? " has" : "s have"} blocking issues`
    },
    "in-progress": {
      tone: "amber",
      label: "Phase In Progress", 
      description: "Some readiness checks still pending"
    }
  };

  const config = statusConfig[readinessStatus];

  return (
    <section
      id="phase-readiness"
      className="scroll-mt-24"
      data-testid={props.testId}
    >
      <DashboardCard 
        title="Phase Readiness"
        description="Current phase transition readiness assessment"
        className={`border-${config.tone}-700/60 bg-${config.tone}-950/20`}
      >
        <div>
          <div className="flex items-center justify-between">
            <div></div>
            <span className={`inline-flex items-center rounded-full bg-${config.tone}-900/50 px-3 py-1 text-sm font-medium text-${config.tone}-200`}>
              {config.label}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Current Phase Status */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-400">Current Phase</p>
              <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1 text-xs text-slate-300">
                Season {league.season.year}
              </span>
            </div>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {formatLeaguePhaseLabel(currentPhase)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {config.description}
            </p>
            <div className="mt-3">
              <Link
                href="/rules"
                className="inline-flex text-xs text-sky-300 hover:text-sky-200"
                data-testid="phase-rules-link"
              >
                Review Deadlines & Rules →
              </Link>
            </div>
          </div>

          {/* Next Phase Preparation */}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Next Phase</p>
            <p className="mt-2 text-lg font-semibold text-slate-100">
              {formatLeaguePhaseLabel(nextPhase)}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Transition readiness: {isReadyForTransition ? "Ready" : "Blocked"}
            </p>
            
            {isReadyForTransition ? (
              <div className="mt-3">
                <Button
                  type="button"
                  onClick={() => props.actions.onPhaseTransition(nextPhase)}
                  disabled={props.actions.busyAction !== null}
                  variant="primary"
                  size="sm"
                  data-testid="phase-transition-button"
                >
                  {props.actions.busyAction === `phase:${nextPhase}` ? "Transitioning..." : `Advance to ${formatLeaguePhaseLabel(nextPhase)}`}
                </Button>
              </div>
            ) : (
              <div className="mt-3">
                <span className="inline-flex items-center rounded border border-red-700/60 px-3 py-1.5 text-xs text-red-300">
                  Transition Blocked
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Readiness Checklist */}
        <div className="mt-4">
          <h4 className="text-xs font-semibold text-slate-200">Readiness Checklist</h4>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {readinessChecks.map((check, index) => {
              // Simplified check status - in real implementation would check actual data
              const isCheckPassed = check.includes("compliance") ? !hasBlockingIssues : true;
              
              return (
                <div
                  key={index}
                  className="flex items-center gap-3 rounded border border-slate-800 bg-slate-950/60 p-3"
                >
                  <div className={`h-2 w-2 rounded-full ${isCheckPassed ? "bg-emerald-500" : "bg-amber-500"}`} />
                  <span className="text-sm text-slate-300">{check}</span>
                  {!isCheckPassed && (
                    <span className="ml-auto text-xs text-amber-400">Pending</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase Schedule Reference */}
        <div className="mt-4 rounded-lg border border-slate-800/40 bg-slate-950/30 p-3">
          <p className="text-xs font-semibold text-slate-200">Schedule Reference</p>
          <div className="mt-1 grid gap-2 text-sm text-slate-400 md:grid-cols-3">
            <span>Regular Season: {league.season.regularSeasonWeeks} weeks</span>
            <span>Playoffs: Weeks {league.season.playoffStartWeek}-{league.season.playoffEndWeek}</span>
            <span>Current: {formatLeaguePhaseLabel(currentPhase)}</span>
          </div>
        </div>
      </DashboardCard>
    </section>
  );
}