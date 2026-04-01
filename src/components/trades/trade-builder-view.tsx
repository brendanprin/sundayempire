"use client";

import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { TradeStatusBadge } from "@/components/trades/trade-status-badge";
import { Button, Select, Checkbox } from "@/components/ui";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type {
  TradeBuilderContextResponse,
  TradeProposalDetailResponse,
} from "@/types/trade-workflow";

type SelectionState = {
  proposerPlayers: Set<string>;
  proposerPicks: Set<string>;
  counterpartyPlayers: Set<string>;
  counterpartyPicks: Set<string>;
};

function selectedAssetCount(selectionState: SelectionState) {
  return (
    selectionState.proposerPlayers.size +
    selectionState.proposerPicks.size +
    selectionState.counterpartyPlayers.size +
    selectionState.counterpartyPicks.size
  );
}

function formatDelta(before: number, after: number) {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta}`;
}

function outcomeTone(outcome: string) {
  if (outcome === "FAIL_HARD_BLOCK") {
    return "border-rose-700/50 bg-rose-950/30 text-rose-100";
  }
  if (outcome === "FAIL_REQUIRES_COMMISSIONER" || outcome === "PASS_WITH_WARNING") {
    return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  }
  return "border-emerald-700/50 bg-emerald-950/30 text-emerald-100";
}

function buildSelectedAssets(
  pool: TradeBuilderContextResponse["assetPools"][number] | null,
  selectionState: SelectionState,
  isProposer: boolean,
) {
  if (!pool) {
    return [];
  }

  const playerSelection = isProposer
    ? selectionState.proposerPlayers
    : selectionState.counterpartyPlayers;
  const pickSelection = isProposer
    ? selectionState.proposerPicks
    : selectionState.counterpartyPicks;

  const playerLabels = pool.players
    .filter((player) => playerSelection.has(player.playerId))
    .map((player) => `${player.name} · ${player.position} · $${player.salary}`);
  const pickLabels = pool.picks
    .filter((pick) => pickSelection.has(pick.id))
    .map((pick) => pick.label);

  return [...playerLabels, ...pickLabels];
}

function buildSubmissionGuidance(
  detail: TradeProposalDetailResponse | null,
  selectedCount: number,
) {
  if (selectedCount === 0) {
    return "Select assets from both teams before saving or validating the proposal.";
  }
  if (!detail) {
    return "Save a trade draft to capture the package before validation or submission.";
  }
  if (!detail.currentEvaluation) {
    return "Run Trade Validation to generate findings and post-trade impact before submission.";
  }
  if (detail.currentEvaluation.outcome === "FAIL_HARD_BLOCK") {
    return "Current hard-block findings should be resolved before you try to submit this proposal.";
  }
  if (detail.currentEvaluation.outcome === "FAIL_REQUIRES_COMMISSIONER") {
    return "This package can still be submitted, but it will route to commissioner review because validation flagged it.";
  }
  return "The latest validation snapshot is available below. Submit when the package is ready to send.";
}

export function TradeBuilderView(props: {
  context: TradeBuilderContextResponse;
  detail: TradeProposalDetailResponse | null;
  proposerTeamId: string;
  counterpartyTeamId: string;
  selectionState: SelectionState;
  busyLabel: string | null;
  error: string | null;
  message: string | null;
  onChangeProposerTeam: (teamId: string) => void;
  onChangeCounterpartyTeam: (teamId: string) => void;
  onToggleProposerPlayer: (playerId: string) => void;
  onToggleProposerPick: (pickId: string) => void;
  onToggleCounterpartyPlayer: (playerId: string) => void;
  onToggleCounterpartyPick: (pickId: string) => void;
  onSaveDraft: () => Promise<void> | void;
  onValidate: () => Promise<void> | void;
  onSubmit: () => Promise<void> | void;
}) {
  const proposerPool =
    props.context.assetPools.find((pool) => pool.team.id === props.proposerTeamId) ?? null;
  const counterpartyPool =
    props.context.assetPools.find((pool) => pool.team.id === props.counterpartyTeamId) ?? null;
  const selectedCount = selectedAssetCount(props.selectionState);
  const currentEvaluation = props.detail?.currentEvaluation ?? null;
  const isMember = props.context.viewer.leagueRole === "MEMBER";
  const proposerTeamOptions =
    isMember
      ? props.context.teams.filter((team) => team.id === props.context.viewer.teamId)
      : props.context.teams;
  const counterpartyOptions = props.context.teams.filter(
    (team) => team.id !== props.proposerTeamId,
  );
  const proposerSelectedAssets = buildSelectedAssets(proposerPool, props.selectionState, true);
  const counterpartySelectedAssets = buildSelectedAssets(
    counterpartyPool,
    props.selectionState,
    false,
  );
  const submissionGuidance = buildSubmissionGuidance(props.detail, selectedCount);

  return (
    <div className="space-y-6" data-testid="trade-builder">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.3)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Proposal workflow</p>
            <h2 className="mt-2 text-3xl font-semibold text-slate-100">Trade Builder</h2>
            <p className="mt-2 text-sm text-slate-400">
              {props.context.league.name} · {props.context.season.year} ·{" "}
              {formatLeaguePhaseLabel(props.context.season.phase)}
            </p>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Build the package from available assets, run trade review, and review
              post-trade impact before submitting.
            </p>
          </div>
          {props.detail ? <TradeStatusBadge status={props.detail.proposal.status} /> : null}
        </div>
      </section>

      {props.error ? (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {props.error}
        </div>
      ) : null}
      {props.message ? (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {props.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Teams" eyebrow="Proposal scope">
          <p className="text-lg font-semibold text-slate-100">
            {proposerPool?.team.name ?? "Select a proposer"} vs{" "}
            {counterpartyPool?.team.name ?? "Select a counterparty"}
          </p>
        </DashboardCard>
        <DashboardCard title="Selected Assets" eyebrow="Package size">
          <p className="text-3xl font-semibold text-slate-100">{selectedCount}</p>
        </DashboardCard>
        <DashboardCard title="Latest Decision" eyebrow="Trade review">
          <p className="text-lg font-semibold text-slate-100">
            {currentEvaluation ? formatEnumLabel(currentEvaluation.outcome) : "Not run yet"}
          </p>
        </DashboardCard>
        <DashboardCard title="Submission Path" eyebrow="Next step">
          <p className="text-sm font-medium text-slate-100">
            {currentEvaluation?.remediation?.requiresCommissionerReview
              ? "Commissioner review required"
              : props.detail
                ? "Standard trade proposal flow"
                : "Save a draft first"}
          </p>
        </DashboardCard>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(22rem,0.95fr)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(24rem,0.9fr)]">
        <div className="space-y-6">
          <DashboardCard
            title="Teams and asset sources"
            description="Choose the two teams first, then pull players and picks from each source pool."
            testId="trade-builder-sources"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-slate-300">Proposing team</span>
                <Select
                  data-testid="trade-builder-proposer-team-select"
                  value={props.proposerTeamId}
                  onChange={(event) => props.onChangeProposerTeam(event.target.value)}
                  disabled={isMember}
                  className="w-full"
                >
                  {proposerTeamOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-slate-300">Counterparty team</span>
                <Select
                  data-testid="trade-builder-counterparty-team-select"
                  value={props.counterpartyTeamId}
                  onChange={(event) => props.onChangeCounterpartyTeam(event.target.value)}
                  className="w-full"
                >
                  {counterpartyOptions.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
          </DashboardCard>

          {selectedCount === 0 ? (
            <div className="rounded-lg border border-sky-700/50 bg-sky-950/20 px-4 py-3 text-sm text-sky-100">
              <span className="font-medium">Start here —</span> select players and picks from each team to build your trade package.
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            {[proposerPool, counterpartyPool].map((pool, index) => {
              if (!pool) {
                return (
                  <DashboardCard
                    key={`missing-${index}`}
                    title={index === 0 ? "Proposer assets" : "Counterparty assets"}
                    description="Select both teams to load asset pools."
                  >
                    <p className="text-sm text-slate-500">
                      Asset pool unavailable. Select both teams to reload the source lists.
                    </p>
                  </DashboardCard>
                );
              }

              const isProposer = index === 0;
              const playerSelection = isProposer
                ? props.selectionState.proposerPlayers
                : props.selectionState.counterpartyPlayers;
              const pickSelection = isProposer
                ? props.selectionState.proposerPicks
                : props.selectionState.counterpartyPicks;

              return (
                <DashboardCard
                  key={pool.team.id}
                  title={pool.team.name}
                  eyebrow="Available assets"
                  description={`${pool.players.length} players · ${pool.picks.length} picks`}
                  testId={
                    isProposer ? "trade-builder-assets-proposer" : "trade-builder-assets-counterparty"
                  }
                >
                  <div className="space-y-4">
                    {pool.availability.pickDataIncomplete ? (
                      <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-xs text-amber-100">
                            Pick ownership is partially unavailable for this team. Review the available pick data before validating or submitting the proposal.
                      </div>
                    ) : null}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">Players</h4>
                      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
                        {pool.players.map((player) => (
                          <label
                            key={player.contractId}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm"
                          >
                            <Checkbox
                              checked={playerSelection.has(player.playerId)}
                              onChange={() =>
                                isProposer
                                  ? props.onToggleProposerPlayer(player.playerId)
                                  : props.onToggleCounterpartyPlayer(player.playerId)
                              }
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-100">
                                {player.name}
                              </span>
                              <span className="block text-xs text-slate-400">
                                {player.position} · ${player.salary} · {player.yearsRemaining} year(s)
                              </span>
                              {player.isFranchiseTag || player.isRestricted ? (
                                <span className="mt-1 block text-xs text-amber-200">
                                  {player.isFranchiseTag ? "Tagged" : null}
                                  {player.isFranchiseTag && player.isRestricted ? " · " : null}
                                  {player.isRestricted ? "Restricted" : null}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                        {pool.players.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No tradable players are currently available in this pool.
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-100">Picks</h4>
                      <div className="mt-2 max-h-44 space-y-2 overflow-y-auto pr-1">
                        {pool.picks.map((pick) => (
                          <label
                            key={pick.id}
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-sm"
                          >
                            <Checkbox
                              checked={pickSelection.has(pick.id)}
                              onChange={() =>
                                isProposer
                                  ? props.onToggleProposerPick(pick.id)
                                  : props.onToggleCounterpartyPick(pick.id)
                              }
                              className="mt-1"
                            />
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-100">
                                {pick.label}
                              </span>
                            </span>
                          </label>
                        ))}
                        {pool.picks.length === 0 ? (
                          <p className="text-sm text-slate-500">
                            No current picks are available from this source pool.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </DashboardCard>
              );
            })}
          </div>
        </div>

        <div
          className="space-y-4 xl:sticky xl:top-24"
          data-testid="trade-builder-summary-rail"
        >
          <section
            className="scroll-mt-6 rounded-2xl border border-slate-600/80 bg-slate-900/60 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.35),inset_0_1px_0_rgba(148,163,184,0.06)]"
            data-testid="trade-builder-composition"
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Proposed exchange</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-100">Trade Package</h3>
            </div>
            <div className="mt-5 space-y-4 text-sm">
              {[
                {
                  title: proposerPool?.team.name ?? "Proposing team",
                  items: proposerSelectedAssets,
                },
                {
                  title: counterpartyPool?.team.name ?? "Counterparty team",
                  items: counterpartySelectedAssets,
                },
              ].map((section) => (
                <div key={section.title} className="rounded-xl border border-slate-700 bg-slate-950/50 p-4">
                  <p className="font-semibold text-slate-100">{section.title}</p>
                  {section.items.length === 0 ? (
                    <p className="mt-2 text-slate-500">
                      No assets selected yet. Add players or picks from each source pool to build the package.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-slate-300">
                      {section.items.map((item) => (
                        <li key={`${section.title}:${item}`}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <DashboardCard
            title="Validation findings"
            description="Server-side policy findings stay separate from package composition so blockers are easier to scan."
            testId="trade-builder-validation"
          >
            {!currentEvaluation ? (
              <p className="text-sm text-slate-500">
                Run Trade Validation to capture the current decision, policy findings, and post-trade impact.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <TradeStatusBadge status={props.detail?.proposal.status ?? "DRAFT"} />
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${outcomeTone(currentEvaluation.outcome)}`}>
                    {currentEvaluation.outcome}
                  </span>
                </div>
                {currentEvaluation.remediation?.reasons.length ? (
                  <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 px-3 py-3 text-sm text-amber-100">
                    {currentEvaluation.remediation.reasons.join(" ")}
                  </div>
                ) : null}
                <div className="space-y-2">
                  {currentEvaluation.findings.length > 0 ? (
                    currentEvaluation.findings.map((finding) => (
                      <div
                        key={`${finding.code}:${finding.message}`}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          finding.category === "hard_block"
                            ? "border-rose-700/50 bg-rose-950/30 text-rose-100"
                            : finding.category === "review"
                              ? "border-amber-700/50 bg-amber-950/30 text-amber-100"
                              : "border-slate-700 bg-slate-900 text-slate-200"
                        }`}
                      >
                        <p className="font-medium">{finding.code}</p>
                        <p className="mt-1">{finding.message}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400">No findings in the latest evaluation.</p>
                  )}
                </div>
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Impact visibility"
            description="Post-trade cap, roster, and compliance impact stays adjacent to the trade review findings."
            testId="trade-builder-impact"
          >
            {!currentEvaluation?.postTradeProjection.available ? (
              <p className="text-sm text-slate-500">
                Impact visibility appears after a validation snapshot is available. Save and validate the package to populate this panel.
              </p>
            ) : (
              <div className="space-y-3">
                {[currentEvaluation.postTradeProjection.teamA, currentEvaluation.postTradeProjection.teamB]
                  .filter((team): team is NonNullable<typeof team> => Boolean(team))
                  .map((team) => (
                    <div
                      key={team.teamId}
                      className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm"
                    >
                      <p className="font-medium text-slate-100">{team.teamName}</p>
                      <div className="mt-2 space-y-1 text-slate-300">
                        <p>
                          Roster {team.rosterCountBefore} → {team.rosterCountAfter} (
                          {formatDelta(team.rosterCountBefore, team.rosterCountAfter)})
                        </p>
                        <p>
                          Active cap ${team.activeCapBefore} → ${team.activeCapAfter} (
                          {formatDelta(team.activeCapBefore, team.activeCapAfter)})
                        </p>
                        <p>
                          Dead cap ${team.deadCapBefore} → ${team.deadCapAfter} (
                          {formatDelta(team.deadCapBefore, team.deadCapAfter)})
                        </p>
                        <p>
                          Compliance {team.complianceStatusBefore} → {team.complianceStatusAfter}
                        </p>
                      </div>
                      {team.introducedFindings.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-xs text-amber-100">
                          {team.introducedFindings.map((finding) => (
                            <li key={`${team.teamId}:${finding.code}:${finding.message}`}>
                              {finding.code}: {finding.message}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard
            title="Available actions"
            description="Save first, validate against league rules, then submit once the package is ready."
            testId="trade-builder-actions"
          >
            <div className="space-y-3 text-sm text-slate-300">
              <p>{submissionGuidance}</p>
              {currentEvaluation?.outcome === "FAIL_HARD_BLOCK" ? (
                <p className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-3 text-rose-100">
                  Submission is likely to fail until the hard-block findings above are addressed.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={props.onSaveDraft}
                disabled={Boolean(props.busyLabel)}
                loading={props.busyLabel === "save"}
              >
                {props.busyLabel === "save" ? "Saving..." : "Save Trade Draft"}
              </Button>
              <button
                type="button"
                onClick={props.onValidate}
                disabled={Boolean(props.busyLabel)}
                className="rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-2 text-sm font-medium text-sky-100 hover:border-sky-500 disabled:opacity-60"
              >
                {props.busyLabel === "validate" ? "Running..." : "Run Trade Validation"}
              </button>
              <Button
                type="button"
                variant="primary"
                onClick={props.onSubmit}
                disabled={Boolean(props.busyLabel)}
                loading={props.busyLabel === "submit"}
              >
                {props.busyLabel === "submit" ? "Submitting..." : "Submit Trade Proposal"}
              </Button>
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
