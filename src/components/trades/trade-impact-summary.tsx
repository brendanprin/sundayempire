"use client";

import type { TradeProposalDetailResponse } from "@/types/trade-workflow";

type PostTradeProjection = NonNullable<TradeProposalDetailResponse["currentEvaluation"]>["postTradeProjection"];

function formatDelta(before: number, after: number) {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta}`;
}

function deltaTone(delta: number, inverted = false) {
  if (delta === 0) {
    return "text-slate-400";
  }
  
  const isPositive = inverted ? delta < 0 : delta > 0;
  return isPositive ? "text-emerald-400" : "text-rose-400";
}

function ImpactMetric({ 
  label, 
  before, 
  after, 
  format = "number",
  inverted = false 
}: { 
  label: string; 
  before: number; 
  after: number; 
  format?: "number" | "currency"; 
  inverted?: boolean;
}) {
  const delta = after - before;
  const prefix = format === "currency" ? "$" : "";
  
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="text-right">
        <div className="text-sm text-slate-300">
          {prefix}{before} → {prefix}{after}
        </div>
        <div className={`text-xs font-medium ${deltaTone(delta, inverted)}`}>
          ({prefix}{formatDelta(before, after)})
        </div>
      </div>
    </div>
  );
}

function TeamImpactCard({
  team,
  introducedFindings
}: {
  team: NonNullable<PostTradeProjection["teamA"]>;
  introducedFindings?: Array<{ code: string; message: string; }>;
}) {
  const hasNewFindings = introducedFindings && introducedFindings.length > 0;
  
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-slate-100">{team.teamName}</h4>
        {hasNewFindings && (
          <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-amber-700/30 text-amber-200">
            +{introducedFindings.length} issue{introducedFindings.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      
      <div className="space-y-2">
        <ImpactMetric
          label="Roster Count"
          before={team.rosterCountBefore}
          after={team.rosterCountAfter}
        />
        <ImpactMetric
          label="Active Cap"
          before={team.activeCapBefore}
          after={team.activeCapAfter}
          format="currency"
        />
        <ImpactMetric
          label="Dead Cap"
          before={team.deadCapBefore}
          after={team.deadCapAfter}
          format="currency"
          inverted={true}
        />
      </div>
      
      {team.complianceStatusBefore !== team.complianceStatusAfter && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Compliance</span>
            <div className="text-right">
              <div className="text-sm text-slate-300">
                {team.complianceStatusBefore} → {team.complianceStatusAfter}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {hasNewFindings && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <h5 className="text-xs font-medium text-amber-200 mb-2">New Issues</h5>
          <ul className="space-y-1">
            {introducedFindings.map((finding, index) => (
              <li key={`${team.teamId}:${finding.code}:${index}`} className="text-xs text-amber-100">
                <span className="font-medium">{finding.code}:</span> {finding.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function TradeImpactSummary(props: {
  impact: PostTradeProjection | null;
  compact?: boolean;
  testId?: string;
}) {
  return (
    <div 
      className="space-y-4"
      data-testid={props.testId || "trade-impact-summary"}
    >
      {/* Impact Header */}
      <div>
        <h3 className={`font-semibold text-slate-100 ${props.compact ? 'text-base' : 'text-lg'}`}>
          Post-Trade Impact
        </h3>
        <p className="text-xs text-slate-400">
          Before and after roster, cap, and compliance changes
        </p>
      </div>

      {/* Impact Content */}
      {!props.impact?.available ? (
        <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/30 px-4 py-6 text-center">
          <p className="text-sm text-slate-400 font-medium mb-2">
            Impact Analysis Unavailable
          </p>
          <p className="text-xs text-slate-500">
            Post-trade impact will appear after validation is complete.
          </p>
        </div>
      ) : (
        <div className={`grid gap-3 ${props.compact ? 'lg:grid-cols-1' : 'md:grid-cols-2'}`}>
          {[props.impact.teamA, props.impact.teamB]
            .filter((team): team is NonNullable<typeof team> => Boolean(team))
            .map((team) => (
              <TeamImpactCard
                key={team.teamId}
                team={team}
                introducedFindings={team.introducedFindings}
              />
            ))}
        </div>
      )}

      {/* Impact Summary */}
      {props.impact?.available && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
          <p className="text-xs text-slate-400">
            <span className="font-medium text-slate-300">Impact Preview:</span> Changes shown reflect the proposed trade outcome.
            Actual changes occur only after trade settlement.
          </p>
        </div>
      )}
    </div>
  );
}