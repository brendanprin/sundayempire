"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { PhaseBadge } from "@/components/dashboard/phase-badge";
import { CompactEmptyState } from "@/components/layout/canonical-route-state";
import { ImpactPreviewPanel } from "@/components/team/impact-preview-panel";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type { ContractImpactPreview, PlayerContractDetailProjection } from "@/types/detail";

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toLocaleString()}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString();
}

type ViewerRole = "COMMISSIONER" | "MEMBER";
type PreviewActionId = ContractImpactPreview["action"];

function toneForSeverity(severity: string | null) {
  if (severity === "ERROR") {
    return "critical";
  }

  if (severity === "WARNING") {
    return "warning";
  }

  return "neutral";
}

function badgeClasses(tone: "neutral" | "warning" | "critical" | "info" = "neutral") {
  if (tone === "critical") {
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)] shadow-[0_0_0_2px_var(--status-critical-ring)] font-semibold";
  }

  if (tone === "warning") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] shadow-[0_0_0_1px_var(--status-warning-ring)] font-medium";
  }

  if (tone === "info") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[0_0_0_1px_var(--status-info-ring)]";
  }

  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]";
}

function previewStatusCopy(
  preview: ContractImpactPreview | null,
  action: PreviewActionId,
) {
  if (!preview || preview.action !== action) {
    return null;
  }

  if (preview.legal) {
    return "Latest preview completed successfully. Review the impact panel before acting.";
  }

  return preview.blockedReason ?? "Latest preview is blocked by current league rules.";
}

function previewStatusTone(
  preview: ContractImpactPreview | null,
  action: PreviewActionId,
) {
  if (!preview || preview.action !== action) {
    return null;
  }

  return preview.legal ? "success" : "blocked";
}

function DecisionActionCard(props: {
  title: string;
  description: string;
  buttonLabel: string;
  enabled: boolean;
  blockedReason: string | null;
  latestPreviewCopy: string | null;
  latestPreviewTone: "success" | "blocked" | null;
  tone?: "neutral" | "warning" | "info";
  onClick: (() => void) | null;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">{props.title}</h4>
          <p className="mt-1 text-sm text-slate-400">{props.description}</p>
        </div>

        <button
          type="button"
          disabled={!props.enabled}
          onClick={() => props.onClick?.()}
          className={`rounded-md border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
            props.tone === "warning"
              ? "border-amber-700 text-amber-100 hover:border-amber-500"
              : props.tone === "info"
                ? "border-sky-700 text-sky-100 hover:border-sky-500"
                : "border-slate-700 text-slate-100 hover:border-slate-500"
          }`}
        >
          {props.buttonLabel}
        </button>

        {props.blockedReason ? (
          <p className="rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-100">
            {props.blockedReason}
          </p>
        ) : null}

        {props.latestPreviewCopy ? (
          <p
            className={`rounded-md border px-3 py-2 text-xs ${
              props.latestPreviewTone === "blocked"
                ? "border-red-700/40 bg-red-950/20 text-red-100"
                : "border-emerald-700/40 bg-emerald-950/20 text-emerald-100"
            }`}
          >
            {props.latestPreviewCopy}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerContractDetailView(props: {
  detail: PlayerContractDetailProjection;
  viewerRole: ViewerRole;
  viewerTeamId: string | null;
  preview: ContractImpactPreview | null;
  previewLoadingLabel: string | null;
  previewError: string | null;
  onPreviewCut: (teamId: string, playerId: string) => Promise<void> | void;
  onPreviewFranchiseTag: (contractId: string) => Promise<void> | void;
  onPreviewRookieOption: (contractId: string) => Promise<void> | void;
}) {
  const previewTeamId = props.detail.contract?.team.id ?? props.detail.rosterContext?.team.id ?? null;
  const canPreview =
    props.viewerRole === "COMMISSIONER" ||
    (props.viewerRole === "MEMBER" && previewTeamId !== null && props.viewerTeamId === previewTeamId);
  const currentTeam = props.detail.contract?.team ?? props.detail.rosterContext?.team ?? null;
  const currentContract = props.detail.contract;
  const deadCapExposureTotal =
    currentContract?.deadCapSchedule.reduce((sum, charge) => sum + charge.effectiveAmount, 0) ?? 0;

  const cutBlockedReason = !canPreview
    ? "Cut previews are limited to commissioners and members assigned to the team."
    : !previewTeamId
      ? "A cut preview requires an owning team context for this player."
      : null;

  const franchiseTagBlockedReason = !canPreview
    ? "Franchise-tag previews are limited to commissioners and members assigned to the team."
    : !currentContract
      ? "No current contract is available for a franchise-tag preview."
      : currentContract.isFranchiseTag
        ? "This player is already on a franchise tag."
        : null;

  const rookieOptionBlockedReason = !canPreview
    ? "Rookie-option previews are limited to commissioners and members assigned to the team."
    : !currentContract
      ? "No current contract is available for a rookie-option preview."
      : !currentContract.rookieOptionEligible
        ? "This contract is not rookie-option eligible."
        : currentContract.rookieOptionExercised
          ? "The rookie option has already been exercised."
          : null;

  return (
    <div className="space-y-6" data-testid="player-contract-detail">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Player / Contract Detail</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">{props.detail.player.name}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {props.detail.player.position} · {props.detail.player.nflTeam ?? "Free Agent"}
              {props.detail.player.age !== null ? ` · Age ${props.detail.player.age}` : ""}
              {props.detail.player.yearsPro !== null ? ` · ${props.detail.player.yearsPro} years pro` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {props.detail.season ? (
              <PhaseBadge
                label={formatLeaguePhaseLabel(props.detail.season.currentPhase ?? props.detail.season.legacyPhase)}
                tone={toneForSeverity(props.detail.complianceSummary.highestSeverity)}
              />
            ) : null}
            <span className={`rounded-full border px-3 py-1 text-xs ${badgeClasses("neutral")}`}>
              {currentContract ? formatEnumLabel(currentContract.status) : "No active contract"}
            </span>
            {currentContract?.isFranchiseTag ? (
              <span className={`rounded-full border px-3 py-1 text-xs ${badgeClasses("warning")}`}>
                Tagged
              </span>
            ) : null}
            {currentContract?.rookieOptionEligible && !currentContract.rookieOptionExercised ? (
              <span className={`rounded-full border px-3 py-1 text-xs ${badgeClasses("info")}`}>
                Option eligible
              </span>
            ) : null}
            {currentContract?.deadCapSchedule.length ? (
              <span className={`rounded-full border px-3 py-1 text-xs ${badgeClasses("critical")}`}>
                Dead cap relevant
              </span>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="player-summary-strip">
        <DashboardCard title="Current Team" eyebrow="Roster">
          <p className="text-lg font-semibold text-slate-100">
            {currentTeam ? (
              <Link href={`/teams/${currentTeam.id}`} className="hover:text-sky-300">
                {currentTeam.name}
              </Link>
            ) : (
              "Unrostered"
            )}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {props.detail.rosterContext
              ? `${props.detail.rosterContext.slotLabel ?? formatEnumLabel(props.detail.rosterContext.slotType)}`
              : "No active roster slot"}
          </p>
        </DashboardCard>

        <DashboardCard title="Contract State" eyebrow="Current Season">
          <p className="text-2xl font-semibold text-slate-100">
            {currentContract ? formatEnumLabel(currentContract.status) : "No active contract"}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {currentContract
              ? `${formatMoney(currentContract.salary)} · ${currentContract.yearsRemaining}/${currentContract.yearsTotal} years`
              : "No current-season contract is recorded"}
          </p>
        </DashboardCard>

        <DashboardCard title="Open Issues" eyebrow="Compliance">
          <p className="text-3xl font-semibold text-slate-100">
            {props.detail.complianceSummary.openIssueCount}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Highest severity {props.detail.complianceSummary.highestSeverity ?? "None"}
          </p>
        </DashboardCard>

        <DashboardCard title="Dead Cap Exposure" eyebrow="If Released">
          <p className="text-3xl font-semibold text-slate-100">{formatMoney(deadCapExposureTotal)}</p>
          <p className="mt-2 text-sm text-slate-400">
            {currentContract?.deadCapSchedule.length
              ? `${currentContract.deadCapSchedule.length} scheduled charge${
                  currentContract.deadCapSchedule.length === 1 ? "" : "s"
                }`
              : "No dead cap schedule on file"}
          </p>
        </DashboardCard>
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4 2xl:sticky 2xl:top-24">
          <DashboardCard
            title="Contract Summary"
            eyebrow="Contract Analysis"
            description="Review the current contract state before running a preview-backed action."
            testId="player-contract-summary"
          >
            {currentContract ? (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Team</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      <Link href={`/teams/${currentContract.team.id}`} className="hover:text-sky-300">
                        {currentContract.team.name}
                      </Link>
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Salary</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {formatMoney(currentContract.salary)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Years Remaining</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {currentContract.yearsRemaining}/{currentContract.yearsTotal}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Contract State</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">
                      {formatEnumLabel(currentContract.status)}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">Contract Markers</h4>
                    <dl className="mt-3 grid gap-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">Annual Salary</dt>
                        <dd className="font-medium text-slate-100">
                          {formatMoney(currentContract.ledger?.annualSalary ?? null)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">Franchise Tag Salary</dt>
                        <dd className="font-medium text-slate-100">
                          {formatMoney(currentContract.franchiseTagUsage?.finalTagSalary ?? null)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">Option Decision</dt>
                        <dd className="font-medium text-slate-100">
                          {currentContract.optionDecision
                            ? formatEnumLabel(currentContract.optionDecision.decisionType)
                            : "None"}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-slate-500">Dead Cap Schedule</dt>
                        <dd className="font-medium text-slate-100">
                          {currentContract.deadCapSchedule.length}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">Rule Notes</h4>
                    <ul className="mt-3 space-y-2 text-sm text-slate-300">
                      <li>
                        Status: {formatEnumLabel(currentContract.status)}
                        {currentContract.status === "EXPIRING" ? " and due for a near-term contract decision." : "."}
                      </li>
                      <li>
                        {currentContract.isFranchiseTag
                          ? "This player is already on a franchise tag."
                          : "This player is not currently tagged."}
                      </li>
                      <li>
                        {currentContract.rookieOptionEligible
                          ? currentContract.rookieOptionExercised
                            ? "The rookie option has already been exercised."
                            : "A rookie-option preview is available."
                          : "No rookie-option eligibility is on file."}
                      </li>
                      <li>
                        {currentContract.deadCapSchedule.length > 0
                          ? "Dead cap charges are already modeled for this player."
                          : "No dead cap schedule is currently modeled for this player."}
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              <CompactEmptyState message="No current-season contract is recorded for this player. Review the roster context and related issues before taking any further action." />
            )}
          </DashboardCard>

          <DashboardCard
            title="Preview-backed Decisions"
            eyebrow="Action Area"
            description="Run a read-only preview before any cut, tag, or rookie-option decision."
            testId="player-preview-actions"
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <DecisionActionCard
                title="Cut Decision"
                description="Inspect active cap, dead cap, and compliance impact before releasing this player."
                buttonLabel="Preview Cut Impact"
                enabled={!cutBlockedReason}
                blockedReason={cutBlockedReason}
                latestPreviewCopy={previewStatusCopy(props.preview, "cut")}
                latestPreviewTone={previewStatusTone(props.preview, "cut")}
                onClick={
                  !cutBlockedReason && previewTeamId
                    ? () => {
                        void props.onPreviewCut(previewTeamId, props.detail.player.id);
                      }
                    : null
                }
              />

              <DecisionActionCard
                title="Franchise Tag Decision"
                description="Inspect the tag salary and post-decision cap impact before committing to a tag."
                buttonLabel="Preview Franchise Tag Impact"
                enabled={!franchiseTagBlockedReason}
                blockedReason={franchiseTagBlockedReason}
                latestPreviewCopy={previewStatusCopy(props.preview, "franchise_tag")}
                latestPreviewTone={previewStatusTone(props.preview, "franchise_tag")}
                tone="warning"
                onClick={
                  !franchiseTagBlockedReason && currentContract
                    ? () => {
                        void props.onPreviewFranchiseTag(currentContract.id);
                      }
                    : null
                }
              />

              <DecisionActionCard
                title="Rookie Option Decision"
                description="Inspect added years and downstream cap impact before exercising the rookie option."
                buttonLabel="Preview Rookie Option Impact"
                enabled={!rookieOptionBlockedReason}
                blockedReason={rookieOptionBlockedReason}
                latestPreviewCopy={previewStatusCopy(props.preview, "rookie_option")}
                latestPreviewTone={previewStatusTone(props.preview, "rookie_option")}
                tone="info"
                onClick={
                  !rookieOptionBlockedReason && currentContract
                    ? () => {
                        void props.onPreviewRookieOption(currentContract.id);
                      }
                    : null
                }
              />
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Preview requests stay read-only. If league phase or rules block an action, the impact
              preview will explain the blocker without mutating contract state.
            </p>
          </DashboardCard>
        </div>

        <div className="space-y-6">
          <ImpactPreviewPanel
            preview={props.preview}
            loadingLabel={props.previewLoadingLabel}
            error={props.previewError}
            emptyMessage={
              canPreview && previewTeamId
                ? "Use the preview-backed decisions to inspect contract impact before any move."
                : "Preview tools are available to commissioners and team owners only."
            }
            testId="player-impact-preview"
          />

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
                <CompactEmptyState message="No active roster placement is recorded for this player." />
              )}

              <div className="grid gap-2 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                  <span>Season resolved</span>
                  <span className="text-xs text-slate-400">
                    {props.detail.availability.seasonResolved ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                  <span>Current contract</span>
                  <span className="text-xs text-slate-400">
                    {props.detail.availability.currentSeasonContractAvailable ? "Available" : "Unavailable"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                  <span>Roster assignment</span>
                  <span className="text-xs text-slate-400">
                    {props.detail.availability.rosterAssignmentAvailable ? "Available" : "Unavailable"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                  <span>Contract history</span>
                  <span className="text-xs text-slate-400">
                    {props.detail.availability.contractHistoryAvailable ? "Modeled" : "Not yet modeled"}
                  </span>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>

      <DashboardCard title="Additional Details" eyebrow="Reference Information" testId="player-secondary-context">
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h3 className="text-sm font-semibold text-slate-100">Related Issues</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {props.detail.relatedIssues.map((issue) => (
                <li key={issue.id} className="rounded-md border border-slate-800/80 px-3 py-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-100">{issue.title}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {formatEnumLabel(issue.code)} · due {formatDateTime(issue.dueAt)}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses(toneForSeverity(issue.severity))}`}>
                      {formatEnumLabel(issue.severity)}
                    </span>
                  </div>
                </li>
              ))}
              {props.detail.relatedIssues.length === 0 ? (
                <li>
                  <CompactEmptyState message="No open compliance issues are tied to this player." />
                </li>
              ) : null}
            </ul>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-slate-100">Recent Transactions</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {props.detail.recentTransactions.map((transaction) => (
                <li key={transaction.id} className="rounded-md border border-slate-800/80 px-3 py-2.5">
                  <p className="font-medium text-slate-100">{transaction.summary}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatEnumLabel(transaction.type)} · {formatDateTime(transaction.createdAt)}
                  </p>
                </li>
              ))}
              {props.detail.recentTransactions.length === 0 ? (
                <li>
                  <CompactEmptyState message="No recent player transactions were recorded." />
                </li>
              ) : null}
            </ul>
          </section>
        </div>
      </DashboardCard>
    </div>
  );
}
