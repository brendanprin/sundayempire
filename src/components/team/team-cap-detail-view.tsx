"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { PhaseBadge } from "@/components/dashboard/phase-badge";
import { CompactEmptyState } from "@/components/layout/canonical-route-state";
import { MirrorOnlyBanner } from "@/components/layout/mirror-only-banner";
import { ImpactPreviewPanel } from "@/components/team/impact-preview-panel";
import { Button } from "@/components/ui";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type { ContractImpactPreview, TeamCapDetailProjection } from "@/types/detail";

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
type WorkspaceTabId = "overview" | "contracts" | "dead-cap" | "compliance";
type ContractFilterId = "all" | "action-needed" | "expiring" | "tagged" | "option" | "dead-cap";
type ContractSortId = "salary-desc" | "salary-asc" | "years-desc" | "player-asc" | "status-asc";

const WORKSPACE_TABS: Array<{
  id: WorkspaceTabId;
  label: string;
  description: string;
}> = [
  {
    id: "overview",
    label: "Overview",
    description: "Current posture, action pressure, and quick links.",
  },
  {
    id: "contracts",
    label: "Contracts",
    description: "Search, filter, and preview current contract decisions.",
  },
  {
    id: "dead-cap",
    label: "Dead Cap",
    description: "Review present and future cap charges.",
  },
  {
    id: "compliance",
    label: "Compliance",
    description: "Resolve roster and cap issues with next steps.",
  },
];

function resolveTeamWorkspaceTab(hash: string): WorkspaceTabId {
  if (hash === "#team-contracts") {
    return "contracts";
  }

  if (hash === "#dead-cap") {
    return "dead-cap";
  }

  if (hash === "#compliance") {
    return "compliance";
  }

  return "overview";
}

function hashForTeamWorkspaceTab(tab: WorkspaceTabId) {
  if (tab === "contracts") {
    return "#team-contracts";
  }

  if (tab === "dead-cap") {
    return "#dead-cap";
  }

  if (tab === "compliance") {
    return "#compliance";
  }

  return "#team-overview";
}

function contractHasDeadCap(
  contract: TeamCapDetailProjection["contracts"][number],
  deadCapSourceContractIds: Set<string>,
) {
  return deadCapSourceContractIds.has(contract.id);
}

function describeComplianceNextStep(code: string) {
  if (code === "CAP_HARD") {
    return "Open the Contracts tab and identify a cut or contract decision that lowers the hard-cap total.";
  }

  if (code === "ROSTER_SIZE") {
    return "Use the Overview tab to review roster count pressure, then add or remove a player to return to the limit.";
  }

  if (code === "OPTION_DECISION") {
    return "Open the affected player detail and run the rookie-option preview before the deadline.";
  }

  return "Review the affected player and contract, then use the Contracts tab to inspect the safest next move.";
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

function badgeClasses(tone: "neutral" | "warning" | "critical" | "info" = "neutral") {
  if (tone === "critical") {
    return "border-red-700/50 bg-red-950/40 text-red-100";
  }

  if (tone === "warning") {
    return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  }

  if (tone === "info") {
    return "border-sky-700/50 bg-sky-950/30 text-sky-100";
  }

  return "border-slate-700/60 bg-slate-900 text-slate-200";
}

function WorkspaceTabButton(props: {
  id: string;
  active: boolean;
  label: string;
  description: string;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      id={props.id}
      type="button"
      role="tab"
      aria-selected={props.active}
      aria-controls={props.controls}
      onClick={props.onClick}
      className={`rounded-xl border px-4 py-3 text-left transition ${
        props.active
          ? "border-sky-700/70 bg-sky-950/20 text-sky-100"
          : "border-slate-800 bg-slate-950/50 text-slate-300 hover:border-slate-700"
      }`}
    >
      <p className="text-sm font-semibold">{props.label}</p>
      <p className="mt-1 text-xs text-slate-400">{props.description}</p>
    </button>
  );
}

export function TeamCapDetailView(props: {
  detail: TeamCapDetailProjection;
  viewerRole: ViewerRole;
  viewerTeamId: string | null;
  preview: ContractImpactPreview | null;
  previewLoadingLabel: string | null;
  previewError: string | null;
  onPreviewCut: (playerId: string) => Promise<void> | void;
  onPreviewFranchiseTag: (contractId: string) => Promise<void> | void;
  onPreviewRookieOption: (contractId: string) => Promise<void> | void;
}) {
  const canPreview =
    props.viewerRole === "COMMISSIONER" ||
    (props.viewerRole === "MEMBER" && props.viewerTeamId === props.detail.team.id);
  const [activeTab, setActiveTab] = useState<WorkspaceTabId>("overview");
  const [contractQuery, setContractQuery] = useState("");
  const [contractFilter, setContractFilter] = useState<ContractFilterId>("all");
  const [contractSort, setContractSort] = useState<ContractSortId>("salary-desc");
  const deferredContractQuery = useDeferredValue(contractQuery);

  const rosterGroups: Array<{
    label: string;
    slots: TeamCapDetailProjection["roster"]["starters"];
  }> = [
    { label: "Starters", slots: props.detail.roster.starters },
    { label: "Bench", slots: props.detail.roster.bench },
    { label: "IR", slots: props.detail.roster.injuredReserve },
    { label: "Taxi", slots: props.detail.roster.taxi },
  ];

  const deadCapSourceContractIds = useMemo(
    () => new Set(props.detail.deadCap.charges.map((charge) => charge.sourceContractId)),
    [props.detail.deadCap.charges],
  );

  const expiringContracts = useMemo(
    () =>
      props.detail.contracts.filter(
        (contract) => contract.status === "EXPIRING" || contract.yearsRemaining <= 1,
      ),
    [props.detail.contracts],
  );

  const tagCandidates = useMemo(
    () =>
      props.detail.contracts.filter(
        (contract) =>
          !contract.isFranchiseTag &&
          (contract.status === "EXPIRING" || contract.yearsRemaining <= 1),
      ),
    [props.detail.contracts],
  );

  const optionCandidates = useMemo(
    () =>
      props.detail.contracts.filter(
        (contract) => contract.rookieOptionEligible && !contract.rookieOptionExercised,
      ),
    [props.detail.contracts],
  );

  const deadCapRelevantContracts = useMemo(
    () =>
      props.detail.contracts.filter((contract) => contractHasDeadCap(contract, deadCapSourceContractIds)),
    [deadCapSourceContractIds, props.detail.contracts],
  );

  const contractRows = useMemo(() => {
    const search = deferredContractQuery.trim().toLowerCase();

    return [...props.detail.contracts]
      .filter((contract) => {
        if (contractFilter === "expiring") {
          return contract.status === "EXPIRING" || contract.yearsRemaining <= 1;
        }

        if (contractFilter === "tagged") {
          return contract.isFranchiseTag;
        }

        if (contractFilter === "option") {
          return contract.rookieOptionEligible && !contract.rookieOptionExercised;
        }

        if (contractFilter === "dead-cap") {
          return contractHasDeadCap(contract, deadCapSourceContractIds);
        }

        if (contractFilter === "action-needed") {
          return (
            contract.status === "EXPIRING" ||
            contract.yearsRemaining <= 1 ||
            (contract.rookieOptionEligible && !contract.rookieOptionExercised) ||
            contractHasDeadCap(contract, deadCapSourceContractIds)
          );
        }

        return true;
      })
      .filter((contract) => {
        if (!search) {
          return true;
        }

        const values = [
          contract.player.name,
          contract.player.position,
          contract.player.nflTeam ?? "",
          contract.status,
          contract.isFranchiseTag ? "tagged" : "",
          contract.rookieOptionEligible ? "option eligible" : "",
        ]
          .join(" ")
          .toLowerCase();

        return values.includes(search);
      })
      .sort((left, right) => {
        if (contractSort === "salary-asc") {
          return left.salary - right.salary;
        }

        if (contractSort === "years-desc") {
          return right.yearsRemaining - left.yearsRemaining;
        }

        if (contractSort === "player-asc") {
          return left.player.name.localeCompare(right.player.name);
        }

        if (contractSort === "status-asc") {
          return left.status.localeCompare(right.status) || left.player.name.localeCompare(right.player.name);
        }

        return right.salary - left.salary;
      });
  }, [contractFilter, contractSort, deadCapSourceContractIds, deferredContractQuery, props.detail.contracts]);

  useEffect(() => {
    const syncTabFromHash = () => {
      setActiveTab(resolveTeamWorkspaceTab(window.location.hash));
    };

    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
    };
  }, []);

  const selectTab = (tab: WorkspaceTabId) => {
    setActiveTab(tab);

    if (typeof window !== "undefined") {
      const hash = hashForTeamWorkspaceTab(tab);
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}${hash}`,
      );
    }
  };

  return (
    <div className="space-y-6" data-testid="team-cap-detail">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">My Team</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-100">My Roster / Cap</h1>
            <p className="mt-2 text-sm text-slate-400">
              {props.detail.team.name}
              {props.detail.team.abbreviation ? ` (${props.detail.team.abbreviation})` : ""}
              {props.detail.team.divisionLabel ? ` · ${props.detail.team.divisionLabel}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PhaseBadge
              label={formatLeaguePhaseLabel(props.detail.season.currentPhase ?? props.detail.season.legacyPhase)}
              tone={
                props.detail.capSummary.mirrorOnly
                  ? "warning"
                  : toneForSeverity(props.detail.complianceSummary.highestSeverity)
              }
            />
            <span
              className={`rounded-full border px-3 py-1 text-xs ${
                props.detail.complianceSummary.openIssueCount > 0
                  ? badgeClasses(toneForSeverity(props.detail.complianceSummary.highestSeverity))
                  : badgeClasses("info")
              }`}
            >
              {props.detail.complianceSummary.openIssueCount > 0
                ? `${props.detail.complianceSummary.openIssueCount} open issue${
                    props.detail.complianceSummary.openIssueCount === 1 ? "" : "s"
                  }`
                : "No open compliance issues"}
            </span>
          </div>
        </div>

        {props.detail.capSummary.mirrorOnly ? (
          <MirrorOnlyBanner
            message="Roster management is mirror-only during regular season"
            detail="Use your host platform for lineup changes. This workspace provides cap, contract, and compliance visibility."
          />
        ) : null}
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" data-testid="team-summary-strip">
        <DashboardCard title="Roster Posture" eyebrow="Current Season">
          <p className="text-3xl font-semibold text-slate-100">
            {props.detail.capSummary.rosterCount ?? "-"}
            {props.detail.capSummary.rosterLimit !== null ? (
              <span className="ml-2 text-sm text-slate-500">/ {props.detail.capSummary.rosterLimit}</span>
            ) : null}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {props.detail.roster.starters.length} starters · {props.detail.roster.bench.length} bench ·{" "}
            {props.detail.roster.injuredReserve.length} IR · {props.detail.roster.taxi.length} taxi
          </p>
        </DashboardCard>

        <DashboardCard title="Cap Posture" eyebrow="Current Season">
          <p className="text-3xl font-semibold text-slate-100">
            {formatMoney(props.detail.capSummary.hardCapTotal)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Active {formatMoney(props.detail.capSummary.activeCapTotal)} · Dead cap{" "}
            {formatMoney(props.detail.capSummary.deadCapTotal)}
          </p>
        </DashboardCard>

        <DashboardCard title="Cap Room" eyebrow="Pressure Points">
          <p className="text-3xl font-semibold text-slate-100">
            {formatMoney(props.detail.capSummary.capSpaceHard)}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Hard cap room · Soft cap room {formatMoney(props.detail.capSummary.capSpaceSoft)}
          </p>
        </DashboardCard>

        <DashboardCard title="Decision Queue" eyebrow="Action Needed">
          <p className="text-3xl font-semibold text-slate-100">
            {expiringContracts.length + optionCandidates.length + props.detail.complianceSummary.openIssueCount}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            {expiringContracts.length} expiring · {optionCandidates.length} option decisions ·{" "}
            {props.detail.complianceSummary.openIssueCount} compliance items
          </p>
        </DashboardCard>
      </div>

      <section
        className="rounded-2xl border border-slate-800 bg-slate-950/70 p-2"
        data-testid="team-workspace-tabs"
      >
        <div className="grid gap-2 lg:grid-cols-4" role="tablist" aria-label="My Roster and Cap workspace">
          {WORKSPACE_TABS.map((tab) => (
            <WorkspaceTabButton
              key={tab.id}
              id={`team-tab-${tab.id}`}
              active={activeTab === tab.id}
              label={tab.label}
              description={tab.description}
              controls={`team-panel-${tab.id}`}
              onClick={() => selectTab(tab.id)}
            />
          ))}
        </div>
      </section>

      <div className="grid items-start gap-6 2xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.9fr)]">
        <div className="space-y-4 2xl:sticky 2xl:top-24">
          {activeTab === "overview" ? (
            <div
              id="team-panel-overview"
              role="tabpanel"
              aria-labelledby="team-tab-overview"
              data-testid="team-tab-panel-overview"
              className="space-y-6"
            >
              <DashboardCard
                title="Current Status"
                eyebrow="Overview"
                description={`Last recalculated ${formatDateTime(props.detail.capSummary.lastRecalculatedAt)}`}
              >
                <div className="space-y-4">
                  {!props.detail.availability.teamSeasonStateAvailable ? (
                    <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
                      Team season state is partially unavailable. Cap and roster numbers may be
                      missing detail until the next successful recalculation.
                    </div>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-sm text-slate-500">Soft Cap Room</p>
                      <p className="mt-1 text-lg font-semibold text-slate-100">
                        {formatMoney(props.detail.capSummary.capSpaceSoft)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-sm text-slate-500">Hard Cap Room</p>
                      <p className="mt-1 text-lg font-semibold text-slate-100">
                        {formatMoney(props.detail.capSummary.capSpaceHard)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-sm text-slate-500">Expiring Contracts</p>
                      <p className="mt-1 text-lg font-semibold text-slate-100">{expiringContracts.length}</p>
                    </div>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                      <p className="text-sm text-slate-500">Dead Cap Pressure</p>
                      <p className="mt-1 text-lg font-semibold text-slate-100">
                        {formatMoney(props.detail.deadCap.currentSeasonTotal)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => selectTab("contracts")}
                      className="border-sky-700/60 text-sky-100 hover:border-sky-500"
                    >
                      Open Contracts Tab
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => selectTab("dead-cap")}
                    >
                      Review Dead Cap
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => selectTab("compliance")}
                      className="border-amber-700/60 text-amber-100 hover:border-amber-500"
                    >
                      Review Compliance
                    </Button>
                  </div>
                </div>
              </DashboardCard>

              <DashboardCard
                title="Action Candidates"
                eyebrow="Decision Support"
                description="These players and issues are the fastest path to roster or cap pressure."
                testId="team-action-candidates"
              >
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">Expiring Contracts</h4>
                    <ul className="mt-3 space-y-2 text-sm">
                      {expiringContracts.slice(0, 6).map((contract) => (
                        <li key={contract.id} className="flex items-center justify-between gap-3">
                          <Link href={`/players/${contract.player.id}`} className="text-slate-200 hover:text-sky-300">
                            {contract.player.name}
                          </Link>
                          <span className="text-xs text-slate-500">{formatMoney(contract.salary)}</span>
                        </li>
                      ))}
                      {expiringContracts.length === 0 ? (
                        <li className="text-slate-500">No immediate expiring-contract pressure.</li>
                      ) : null}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">Tag Candidates</h4>
                    <ul className="mt-3 space-y-2 text-sm">
                      {tagCandidates.slice(0, 6).map((contract) => (
                        <li key={contract.id} className="flex items-center justify-between gap-3">
                          <Link href={`/players/${contract.player.id}`} className="text-slate-200 hover:text-sky-300">
                            {contract.player.name}
                          </Link>
                          <span className="text-xs text-slate-500">
                            {contract.yearsRemaining} year{contract.yearsRemaining === 1 ? "" : "s"} left
                          </span>
                        </li>
                      ))}
                      {tagCandidates.length === 0 ? (
                        <li className="text-slate-500">No immediate franchise-tag candidates surfaced.</li>
                      ) : null}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100">Option Candidates</h4>
                    <ul className="mt-3 space-y-2 text-sm">
                      {optionCandidates.slice(0, 6).map((contract) => (
                        <li key={contract.id} className="flex items-center justify-between gap-3">
                          <Link href={`/players/${contract.player.id}`} className="text-slate-200 hover:text-sky-300">
                            {contract.player.name}
                          </Link>
                          <span className="text-xs text-slate-500">Rookie option eligible</span>
                        </li>
                      ))}
                      {optionCandidates.length === 0 ? (
                        <li className="text-slate-500">No rookie-option decisions are currently queued.</li>
                      ) : null}
                    </ul>
                  </div>
                </div>
              </DashboardCard>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
                <DashboardCard title="Roster at a Glance" eyebrow="Assignments">
                  <div className="grid gap-4 md:grid-cols-2">
                    {rosterGroups.map((group) => (
                      <div key={group.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h4 className="text-sm font-semibold text-slate-100">{group.label}</h4>
                          <span className="rounded-full border border-slate-700/60 bg-slate-950 px-2 py-0.5 text-xs text-slate-300">
                            {group.slots.length}
                          </span>
                        </div>
                        <ul className="mt-3 space-y-2 text-sm">
                          {group.slots.map((slot) => (
                            <li key={slot.id} className="rounded-md border border-slate-800/80 px-3 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <p className="font-medium text-slate-100">
                                    <Link href={`/players/${slot.player.id}`} className="hover:text-sky-300">
                                      {slot.player.name}
                                    </Link>
                                  </p>
                                  <p className="text-xs text-slate-400">
                                    {slot.slotLabel ?? formatEnumLabel(slot.slotType)} · {slot.player.position} ·{" "}
                                    {slot.player.nflTeam ?? "FA"}
                                  </p>
                                </div>
                                {canPreview ? (
                                  <button
                                    type="button"
                                    onClick={() => props.onPreviewCut(slot.player.id)}
                                    className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
                                  >
                                    Preview Cut Impact
                                  </button>
                                ) : null}
                              </div>
                              {slot.contract ? (
                                <p className="mt-2 text-xs text-slate-400">
                                  {formatEnumLabel(slot.contract.status)} · {formatMoney(slot.contract.salary)} ·{" "}
                                  {slot.contract.yearsRemaining} year{slot.contract.yearsRemaining === 1 ? "" : "s"} left
                                </p>
                              ) : (
                                <p className="mt-2 text-xs text-slate-500">No active contract on file.</p>
                              )}
                            </li>
                          ))}
                          {group.slots.length === 0 ? (
                            <li>
                              <CompactEmptyState message="No players are assigned to this roster bucket." />
                            </li>
                          ) : null}
                        </ul>
                      </div>
                    ))}
                  </div>
                </DashboardCard>

                <div className="space-y-4" data-testid="team-overview-supporting-context">
                  <DashboardCard title="Owned Picks" eyebrow="Draft Capital">
                    <section id="team-picks">
                      <ul className="space-y-2 text-sm">
                        {props.detail.ownedPicks.slice(0, 5).map((pick) => (
                          <li key={pick.id} className="rounded-md border border-slate-800/80 px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium text-slate-100">
                                  {pick.seasonYear} Round {pick.round}
                                </p>
                                <p className="text-xs text-slate-400">
                                  Original team {pick.originalTeam.abbreviation ?? pick.originalTeam.name}
                                </p>
                              </div>
                              <span className="text-xs text-slate-300">
                                {pick.overall ? `Overall ${pick.overall}` : "Unslotted"}
                              </span>
                            </div>
                          </li>
                        ))}
                        {props.detail.ownedPicks.length === 0 ? (
                          <li>
                            <CompactEmptyState
                              message="No picks are projected in the current window."
                              actionHref="/draft"
                              actionLabel="Open Picks & Draft"
                            />
                          </li>
                        ) : null}
                      </ul>
                    </section>
                  </DashboardCard>

                  <DashboardCard title="Recent Transactions" eyebrow="Activity">
                    <ul className="space-y-2 text-sm">
                      {props.detail.recentTransactions.slice(0, 4).map((transaction) => (
                        <li key={transaction.id} className="rounded-md border border-slate-800/80 px-3 py-2.5">
                          <p className="font-medium text-slate-100">{transaction.summary}</p>
                          <p className="mt-1 text-xs text-slate-400">
                            {formatEnumLabel(transaction.type)} · {formatDateTime(transaction.createdAt)}
                          </p>
                        </li>
                      ))}
                      {props.detail.recentTransactions.length === 0 ? (
                        <li>
                          <CompactEmptyState message="No recent transactions were recorded for this team." />
                        </li>
                      ) : null}
                    </ul>
                  </DashboardCard>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "contracts" ? (
            <div id="team-panel-contracts" role="tabpanel" aria-labelledby="team-tab-contracts">
              <DashboardCard
                title="Contracts Workspace"
                eyebrow="Contract View"
                description="Search, filter, and preview current-season contract decisions without mutating state."
                testId="team-contracts-section"
              >
                <section
                  id="team-contracts"
                  aria-label="Team contracts workspace"
                  data-testid="team-tab-panel-contracts"
                >
                <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                  <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-slate-300 sm:min-w-[220px]">
                    Search contracts
                    <input
                      type="search"
                      value={contractQuery}
                      onChange={(event) => setContractQuery(event.target.value)}
                      placeholder="Search player, team, or status"
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-2 text-sm text-slate-300 sm:min-w-[180px]">
                    Sort rows
                    <select
                      value={contractSort}
                      onChange={(event) => setContractSort(event.target.value as ContractSortId)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    >
                      <option value="salary-desc">Salary: high to low</option>
                      <option value="salary-asc">Salary: low to high</option>
                      <option value="years-desc">Years remaining</option>
                      <option value="player-asc">Player name</option>
                      <option value="status-asc">Contract status</option>
                    </select>
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {([
                    ["all", "All contracts"],
                    ["action-needed", "Action needed"],
                    ["expiring", "Expiring"],
                    ["tagged", "Tagged"],
                    ["option", "Option eligible"],
                    ["dead-cap", "Dead cap relevant"],
                  ] as Array<[ContractFilterId, string]>).map(([filterId, label]) => (
                    <button
                      key={filterId}
                      type="button"
                      onClick={() => setContractFilter(filterId)}
                      className={`rounded-full border px-3 py-1 text-xs ${
                        contractFilter === filterId
                          ? "border-sky-700/70 bg-sky-950/20 text-sky-100"
                          : "border-slate-700/60 bg-slate-900 text-slate-300 hover:border-slate-500"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="mt-4 text-sm text-slate-400">
                  Showing {contractRows.length} of {props.detail.contracts.length} contract row
                  {props.detail.contracts.length === 1 ? "" : "s"}.
                </p>

                {!canPreview ? (
                  <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300">
                    Contract actions remain preview-only here. Commissioners and members assigned to this team
                    can run previews to inspect impact before any downstream action.
                  </div>
                ) : null}

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Player</th>
                        <th className="px-3 py-2 text-right font-medium">Salary</th>
                        <th className="px-3 py-2 text-right font-medium">Years</th>
                        <th className="px-3 py-2 text-left font-medium">Contract State</th>
                        <th className="px-3 py-2 text-left font-medium">Preview Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractRows.map((contract) => (
                        <tr key={contract.id} className="border-b border-slate-800/70 last:border-b-0">
                          <td className="px-3 py-3 align-top">
                            <Link href={`/players/${contract.player.id}`} className="font-medium text-slate-100 hover:text-sky-300">
                              {contract.player.name}
                            </Link>
                            <p className="text-xs text-slate-400">
                              {contract.player.position} · {contract.player.nflTeam ?? "FA"}
                            </p>
                          </td>
                          <td className="px-3 py-3 text-right align-top">{formatMoney(contract.salary)}</td>
                          <td className="px-3 py-3 text-right align-top">
                            {contract.yearsRemaining}/{contract.yearsTotal}
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex flex-wrap gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses("neutral")}`}>
                                {formatEnumLabel(contract.status)}
                              </span>
                              {contract.isFranchiseTag ? (
                                <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses("warning")}`}>
                                  Tagged
                                </span>
                              ) : null}
                              {contract.rookieOptionEligible && !contract.rookieOptionExercised ? (
                                <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses("info")}`}>
                                  Option eligible
                                </span>
                              ) : null}
                              {contractHasDeadCap(contract, deadCapSourceContractIds) ? (
                                <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses("critical")}`}>
                                  Dead cap relevant
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top">
                            {canPreview ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => props.onPreviewCut(contract.player.id)}
                                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
                                >
                                  Preview Cut Impact
                                </button>
                                {!contract.isFranchiseTag ? (
                                  <button
                                    type="button"
                                    onClick={() => props.onPreviewFranchiseTag(contract.id)}
                                    className="rounded-md border border-amber-700 px-2 py-1 text-xs text-amber-100 hover:border-amber-500"
                                  >
                                    Preview Franchise Tag Impact
                                  </button>
                                ) : null}
                                {contract.rookieOptionEligible && !contract.rookieOptionExercised ? (
                                  <button
                                    type="button"
                                    onClick={() => props.onPreviewRookieOption(contract.id)}
                                    className="rounded-md border border-sky-700 px-2 py-1 text-xs text-sky-100 hover:border-sky-500"
                                  >
                                    Preview Rookie Option Impact
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-500">
                                Preview access is limited to commissioners and members assigned to this team.
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                      {contractRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                            No contracts match the current filters. Clear the search or switch filters to review more contract decisions.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
                </section>
              </DashboardCard>
            </div>
          ) : null}

          {activeTab === "dead-cap" ? (
            <div id="team-panel-dead-cap" role="tabpanel" aria-labelledby="team-tab-dead-cap">
              <DashboardCard
                title="Dead Cap Breakdown"
                eyebrow="Dead Cap"
                description="Dead cap tracks charges that still count against the cap after a contract-ending event or override."
                testId="team-dead-cap-section"
              >
                <section id="dead-cap" data-testid="team-tab-panel-dead-cap" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Current Season Dead Cap</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {formatMoney(props.detail.deadCap.currentSeasonTotal)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Future Carry</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {formatMoney(props.detail.deadCap.futureCarryTotal)}
                    </p>
                  </div>
                </div>

                {props.detail.deadCap.charges.length === 0 ? (
                  <CompactEmptyState message="No dead cap is counting against this roster right now." />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {props.detail.deadCap.charges.map((charge) => (
                      <li key={charge.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-100">{charge.player.name}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {charge.player.position} · {charge.appliesToSeasonYear ?? "Unknown season"} ·{" "}
                              {formatEnumLabel(charge.sourceEventType)}
                            </p>
                            {charge.isOverride && charge.overrideReason ? (
                              <p className="mt-2 text-xs text-amber-200">
                                Override reason: {charge.overrideReason}
                              </p>
                            ) : null}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-slate-100">
                              {formatMoney(charge.effectiveAmount)}
                            </p>
                            <p className="text-xs text-slate-500">
                              Recorded {formatDateTime(charge.createdAt)}
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                </section>
              </DashboardCard>
            </div>
          ) : null}

          {activeTab === "compliance" ? (
            <div id="team-panel-compliance" role="tabpanel" aria-labelledby="team-tab-compliance">
              <DashboardCard
                title="Compliance Findings"
                eyebrow="Manager Checklist"
                description="Use this checklist to resolve issues before they become roster or cap blockers."
                testId="team-compliance-section"
              >
                <section id="compliance" data-testid="team-tab-panel-compliance" className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Open Issues</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {props.detail.complianceSummary.openIssueCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Warnings</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {props.detail.complianceSummary.warningCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Errors</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {props.detail.complianceSummary.errorCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-sm text-slate-500">Overdue</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-100">
                      {props.detail.complianceSummary.overdueIssueCount}
                    </p>
                  </div>
                </div>

                {props.detail.topIssues.length === 0 ? (
                  <CompactEmptyState message="This roster is currently clear of open compliance blockers." />
                ) : (
                  <ul className="space-y-3 text-sm">
                    {props.detail.topIssues.map((issue) => (
                      <li
                        key={issue.id}
                        data-testid="compliance-finding"
                        className="rounded-lg border border-slate-800 bg-slate-900/60 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-100">{issue.title}</p>
                            <p className="mt-1 text-xs text-slate-400">
                              {formatEnumLabel(issue.code)} · {formatEnumLabel(issue.severity)} · due{" "}
                              {formatDateTime(issue.dueAt)}
                            </p>
                          </div>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses(toneForSeverity(issue.severity))}`}>
                            {formatEnumLabel(issue.severity)}
                          </span>
                        </div>
                        <p className="mt-3 text-sm text-slate-300" data-testid="compliance-next-step">
                          Next step: {describeComplianceNextStep(issue.code)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                </section>
              </DashboardCard>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <DashboardCard
            title="Decision Support"
            eyebrow="Action Needed"
            description="Use this shortlist to move from posture review into the right player-level decision."
            testId="team-decision-support"
          >
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Expiring</h4>
                <ul className="mt-2 space-y-2 text-slate-300">
                  {expiringContracts.slice(0, 4).map((contract) => (
                    <li key={contract.id}>
                      <Link href={`/players/${contract.player.id}`} className="hover:text-sky-300">
                        {contract.player.name}
                      </Link>
                    </li>
                  ))}
                  {expiringContracts.length === 0 ? (
                    <li>
                      <CompactEmptyState message="No expiring contracts." />
                    </li>
                  ) : null}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-100">Tag or Option</h4>
                <ul className="mt-2 space-y-2 text-slate-300">
                  {[...tagCandidates, ...optionCandidates]
                    .slice(0, 4)
                    .map((contract) => (
                      <li key={contract.id}>
                        <Link href={`/players/${contract.player.id}`} className="hover:text-sky-300">
                          {contract.player.name}
                        </Link>
                      </li>
                    ))}
                  {tagCandidates.length + optionCandidates.length === 0 ? (
                    <li>
                      <CompactEmptyState message="No immediate tag or option candidates." />
                    </li>
                  ) : null}
                </ul>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-100">Dead Cap Relevant</h4>
                <ul className="mt-2 space-y-2 text-slate-300">
                  {deadCapRelevantContracts.slice(0, 4).map((contract) => (
                    <li key={contract.id}>
                      <Link href={`/players/${contract.player.id}`} className="hover:text-sky-300">
                        {contract.player.name}
                      </Link>
                    </li>
                  ))}
                  {deadCapRelevantContracts.length === 0 ? (
                    <li>
                      <CompactEmptyState message="No current contracts are tied to dead-cap charges." />
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </DashboardCard>

          <ImpactPreviewPanel
            preview={props.preview}
            loadingLabel={props.previewLoadingLabel}
            error={props.previewError}
            emptyMessage={
              canPreview
                ? "Choose a cut, tag, or option preview from the workspace to inspect financial and compliance impact."
                : "Preview tools are available to commissioners and members assigned to this team."
            }
            testId="team-impact-preview"
          />

          <DashboardCard title="League Data Status" eyebrow="Workspace context" testId="team-data-status">
            <div className="grid gap-2 text-sm text-slate-300">
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                <span>League rules</span>
                <span className="text-xs text-slate-400">
                  {props.detail.availability.rulesetAvailable ? "Ready" : "Missing"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                <span>Season status</span>
                <span className="text-xs text-slate-400">
                  {props.detail.availability.teamSeasonStateAvailable ? "Ready" : "Missing"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                <span>Roster assignments</span>
                <span className="text-xs text-slate-400">
                  {props.detail.availability.rosterAssignmentCoverageComplete ? "Complete" : "Partial"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-slate-800/80 bg-slate-900/40 px-3 py-2">
                <span>Contract history</span>
                <span className="text-xs text-slate-400">
                  {props.detail.availability.contractHistoryAvailable ? "Available" : "Still building"}
                </span>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
