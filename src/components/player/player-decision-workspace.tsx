"use client";

import { PageHeaderBand } from "@/components/layout/page-header-band";
import { PhaseBadge } from "@/components/dashboard/phase-badge";
import { PlayerContractSnapshot } from "@/components/player/player-contract-snapshot";
import { PlayerActionAvailability } from "@/components/player/player-action-availability";
import { ImpactPreviewPanel } from "@/components/team/impact-preview-panel";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { CompactEmptyState } from "@/components/layout/canonical-route-state";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import Link from "next/link";
import type { ContractImpactPreview, PlayerContractDetailProjection } from "@/types/detail";

type ViewerRole = "COMMISSIONER" | "MEMBER";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }
  return new Date(value).toLocaleString();
}

function toneForSeverity(severity: string | null) {
  if (severity === "ERROR") {
    return "critical";
  }

  if (severity === "WARNING") {
    return "warning";
  }

  return "neutral";
}

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }
  return `$${value.toLocaleString()}`;
}

export function PlayerDecisionWorkspace(props: {
  detail: PlayerContractDetailProjection;
  viewerRole: ViewerRole;
  viewerTeamId: string | null;
  preview: ContractImpactPreview | null;
  previewLoadingLabel: string | null;
  previewError: string | null;
  onPreviewCut: (teamId: string, playerId: string) => void;
  onPreviewFranchiseTag: (contractId: string) => void;
  onPreviewRookieOption: (contractId: string) => void;
}) {
  const previewTeamId = props.detail.contract?.team.id ?? props.detail.rosterContext?.team.id ?? null;
  const canPreview =
    props.viewerRole === "COMMISSIONER" ||
    (props.viewerRole === "MEMBER" && previewTeamId !== null && props.viewerTeamId === previewTeamId);
  const currentContract = props.detail.contract;

  return (
    <div className="space-y-6" data-testid="player-contract-detail">
      {/* Page Header */}
      <PageHeaderBand
        eyebrow="Player / Contract Detail"
        title={props.detail.player.name}
        description={`${props.detail.player.position} · ${props.detail.player.nflTeam ?? "Free Agent"}${
          props.detail.player.age !== null ? ` · Age ${props.detail.player.age}` : ""
        }${props.detail.player.yearsPro !== null ? ` · ${props.detail.player.yearsPro} years pro` : ""}`}
        titleTestId="player-header-title"
        aside={
          <div className="flex flex-wrap items-center gap-2">
            {props.detail.season ? (
              <PhaseBadge
                label={formatLeaguePhaseLabel(props.detail.season.currentPhase ?? props.detail.season.legacyPhase)}
                tone={toneForSeverity(props.detail.complianceSummary.highestSeverity)}
              />
            ) : null}
          </div>
        }
      />

      {/* Contract Snapshot */}
      <PlayerContractSnapshot 
        detail={props.detail} 
        testId="player-summary-strip"
      />

      {/* Main Content Grid */}
      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-6 2xl:sticky 2xl:top-24">
          {/* Action Availability */}
          <PlayerActionAvailability
            detail={props.detail}
            viewerRole={props.viewerRole}
            viewerTeamId={props.viewerTeamId}
            preview={props.preview}
            onPreviewCut={props.onPreviewCut}
            onPreviewFranchiseTag={props.onPreviewFranchiseTag}
            onPreviewRookieOption={props.onPreviewRookieOption}
            testId="player-preview-actions"
          />

          {/* Additional Details - Present but not prominent */}
          <DashboardCard
            title="Context Snapshot"
            eyebrow="Additional Details"
            testId="player-context-snapshot"
          >
            <div className="space-y-4">
              {props.detail.rosterContext ? (
                <div className="grid gap-3 text-sm">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="text-slate-500">Team</p>
                    <p className="mt-1 text-base font-semibold text-slate-100">
                      <Link href={`/teams/${props.detail.rosterContext.team.id}`} className="hover:text-sky-300">
                        {props.detail.rosterContext.team.name}
                      </Link>
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <p className="text-slate-500">Slot</p>
                      <p className="mt-1 text-base font-semibold text-slate-100">
                        {props.detail.rosterContext.slotLabel ?? formatEnumLabel(props.detail.rosterContext.slotType)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                      <p className="text-slate-500">Assignment Effective</p>
                      <p className="mt-1 text-base font-semibold text-slate-100">
                        {formatDateTime(props.detail.rosterContext.assignment?.effectiveAt ?? null)}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Acquisition:{" "}
                        {props.detail.rosterContext.assignment
                          ? formatEnumLabel(props.detail.rosterContext.assignment.acquisitionType)
                          : "Unavailable"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <CompactEmptyState message="No roster context is recorded for this player." />
              )}
            </div>
          </DashboardCard>

          {/* Audit/History Context - Keep present but secondary */}
          <DashboardCard
            title="Rule and Phase Context"
            eyebrow="Additional Details"
            testId="player-secondary-context"
          >
            <div className="space-y-4">
              {currentContract ? (
                <div className="grid gap-4 text-sm">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <h4 className="text-sm font-semibold text-slate-100">Contract Details</h4>
                    <dl className="mt-2 grid gap-2">
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Annual Salary</dt>
                        <dd className="text-slate-100">{formatMoney(currentContract.ledger?.annualSalary ?? null)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Tag Salary</dt>
                        <dd className="text-slate-100">{formatMoney(currentContract.franchiseTagUsage?.finalTagSalary ?? null)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Option Decision</dt>
                        <dd className="text-slate-100">
                          {currentContract.optionDecision ? formatEnumLabel(currentContract.optionDecision.decisionType) : "None"}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-slate-500">Dead Cap Charges</dt>
                        <dd className="text-slate-100">{currentContract.deadCapSchedule.length}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <h4 className="text-sm font-semibold text-slate-100">Rule Notes</h4>
                    <ul className="mt-2 space-y-1 text-sm text-slate-300">
                      <li>• Status: {formatEnumLabel(currentContract.status)}</li>
                      <li>• Tagged: {currentContract.isFranchiseTag ? "Yes" : "No"}</li>
                      <li>• Option eligible: {currentContract.rookieOptionEligible ? "Yes" : "No"}</li>
                      <li>• Option exercised: {currentContract.rookieOptionExercised ? "Yes" : "No"}</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <CompactEmptyState message="No contract context available." />
              )}

              {props.detail.complianceSummary.openIssueCount > 0 && (
                <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3">
                  <h4 className="text-sm font-semibold text-amber-100">Compliance Issues</h4>
                  <p className="mt-1 text-sm text-amber-200">
                    {props.detail.complianceSummary.openIssueCount} compliance issue{props.detail.complianceSummary.openIssueCount === 1 ? "" : "s"} detected.
                    Highest severity: {props.detail.complianceSummary.highestSeverity ?? "Unknown"}
                  </p>
                </div>
              )}
            </div>
          </DashboardCard>
        </div>

        {/* Impact Preview - Tied to Selected Action */}
        <div>
          <ImpactPreviewPanel
            preview={props.preview}
            loadingLabel={props.previewLoadingLabel}
            error={props.previewError}
            emptyMessage={
              canPreview && previewTeamId
                ? "Select an action to preview its impact on cap, roster, and compliance."
                : "Preview tools are available to commissioners and members assigned to this team."
            }
            testId="player-impact-preview"
          />
        </div>
      </div>
    </div>
  );
}
