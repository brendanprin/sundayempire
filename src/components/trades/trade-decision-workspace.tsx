"use client";

import { PageHeaderBand } from "@/components/layout/page-header-band";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { TradeProposalCanvas } from "@/components/trades/trade-proposal-canvas";
import { TradeValidationPanel } from "@/components/trades/trade-validation-panel";
import { TradeImpactSummary } from "@/components/trades/trade-impact-summary";
import { Button, Select, Checkbox } from "@/components/ui";
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

  const playerAssets = pool.players
    .filter((player) => playerSelection.has(player.playerId))
    .map((player) => ({
      id: player.contractId,
      assetType: "PLAYER" as const,
      label: player.name,
      player: { 
        id: player.playerId,
        name: player.name,  
        position: player.position
      },
      contract: { 
        status: player.status,
        salary: player.salary
      },
    }));

  const pickAssets = pool.picks
    .filter((pick) => pickSelection.has(pick.id))
    .map((pick) => ({
      id: pick.id,
      assetType: "PICK" as const,
      label: pick.label,
      futurePick: {
        seasonYear: pick.seasonYear,
        round: pick.round
      },
    }));

  return [...playerAssets, ...pickAssets];
}

export function TradeDecisionWorkspace(props: {
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
  isDirty: boolean;
}) {
  const proposerPool =
    props.context.assetPools.find((pool) => pool.team.id === props.proposerTeamId) ?? null;
  const counterpartyPool =
    props.context.assetPools.find((pool) => pool.team.id === props.counterpartyTeamId) ?? null;
  
  const proposerTeam = proposerPool?.team || { id: props.proposerTeamId, name: "Select proposer" };
  const counterpartyTeam = counterpartyPool?.team || { id: props.counterpartyTeamId, name: "Select counterparty" };
  
  const selectedCount = selectedAssetCount(props.selectionState);
  const currentEvaluation = props.detail?.currentEvaluation ?? null;
  
  const proposerAssets = buildSelectedAssets(proposerPool, props.selectionState, true);
  const counterpartyAssets = buildSelectedAssets(counterpartyPool, props.selectionState, false);
  const isMember = props.context.viewer.leagueRole === "MEMBER";
  
  const proposerTeamOptions =
    isMember
      ? props.context.teams.filter((team) => team.id === props.context.viewer.teamId)
      : props.context.teams;
  const counterpartyOptions = props.context.teams.filter(
    (team) => team.id !== props.proposerTeamId,
  );

  const isHardBlocked = currentEvaluation?.outcome === "FAIL_HARD_BLOCK";
  const canValidate = Boolean(props.detail) && !props.isDirty;
  const canSubmit = !props.isDirty && Boolean(props.detail) && Boolean(currentEvaluation) && !isHardBlocked;

  return (
    <div className="space-y-6" data-testid="trade-decision-workspace">
      {/* Page Header with Proposal Scope */}
      <PageHeaderBand
        eyebrow="Trade Workflow"
        title="Trade Builder"
        description={`${props.context.league.name} · ${props.context.season.year} · ${formatLeaguePhaseLabel(props.context.season.phase)}`}
        titleTestId="trade-builder-header"
      />

      {/* Error/Success Messages */}
      {props.error && (
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          {props.error}
        </div>
      )}
      {props.message && (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
          {props.message}
        </div>
      )}

      {/* Trade Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Proposal" eyebrow="Current scope">
          <p className="text-sm font-semibold text-slate-100">
            {proposerTeam.name}
            <span className="mx-2 text-slate-400">vs</span>
            {counterpartyTeam.name}
          </p>
        </DashboardCard>
        <DashboardCard title="Selected Assets" eyebrow="Package size">
          <p className="text-2xl font-semibold text-slate-100">{selectedCount}</p>
        </DashboardCard>
        <DashboardCard title="Validation Status" eyebrow="Last review">
          <p className="text-sm font-semibold text-slate-100">
            {currentEvaluation ? (
              <span className={currentEvaluation.outcome === "FAIL_HARD_BLOCK" ? "text-rose-400" : 
                             currentEvaluation.outcome === "PASS" ? "text-emerald-400" : "text-amber-400"}>
                {currentEvaluation.outcome.replace(/_/g, ' ').toLowerCase()}
              </span>
            ) : (
              "Not validated"
            )}
          </p>
        </DashboardCard>
        <DashboardCard title="Ready to Submit" eyebrow="Next action">
          <p className="text-sm font-medium text-slate-100">
            {isHardBlocked ? "Blocked" : canSubmit ? "Ready" : "Build package first"}
          </p>
        </DashboardCard>
      </div>

      {/* Main Content: Proposal-Centric Layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.6fr)]">
        {/* Primary Panel: Proposal Canvas */}
        <div className="space-y-6">
          <TradeProposalCanvas
            proposerTeam={proposerTeam}
            counterpartyTeam={counterpartyTeam}
            proposerAssets={proposerAssets}
            counterpartyAssets={counterpartyAssets}
            testId="trade-builder-canvas"
          />

          {/* Asset Selection Tools (Secondary) */}
          <DashboardCard
            title="Asset Selection"
            description="Choose teams first, then select players and picks to build the trade package."
            testId="trade-builder-asset-selection"
          >
            {/* Team Selection */}
            <div className="grid gap-4 md:grid-cols-2 mb-6">
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

            {/* Asset Pools */}
            <div className="grid gap-4 lg:grid-cols-2">
              {[proposerPool, counterpartyPool].map((pool, index) => {
                if (!pool) {
                  return (
                    <div
                      key={`missing-${index}`}
                      className="rounded-lg border border-dashed border-slate-700 bg-slate-950/30 p-4 text-center"
                    >
                      <p className="text-sm text-slate-500">
                        Select both teams to load asset pools for selection.
                      </p>
                    </div>
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
                  <div key={pool.team.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                    <h4 className="text-sm font-semibold text-slate-100 mb-3">
                      {pool.team.name} Assets
                    </h4>
                    
                    {/* Players */}
                    <div className="mb-4">
                      <h5 className="text-xs font-medium text-slate-300 mb-2">Players</h5>
                      <div className="max-h-32 space-y-1 overflow-y-auto">
                        {pool.players.map((player) => (
                          <label
                            key={player.contractId}
                            className="flex cursor-pointer items-start gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2 text-xs"
                          >
                            <Checkbox
                              checked={playerSelection.has(player.playerId)}
                              onChange={() =>
                                isProposer
                                  ? props.onToggleProposerPlayer(player.playerId)
                                  : props.onToggleCounterpartyPlayer(player.playerId)
                              }
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block font-medium text-slate-100 truncate">
                                {player.name}
                              </span>
                              <span className="block text-slate-400">
                                {player.position} · ${player.salary}
                              </span>
                            </span>
                          </label>
                        ))}
                        {pool.players.length === 0 && (
                          <p className="text-xs text-slate-500 py-2">No tradable players</p>
                        )}
                      </div>
                    </div>

                    {/* Picks */}
                    <div>
                      <h5 className="text-xs font-medium text-slate-300 mb-2">Picks</h5>
                      <div className="max-h-24 space-y-1 overflow-y-auto">
                        {pool.picks.map((pick) => (
                          <label
                            key={pick.id}
                            className="flex cursor-pointer items-start gap-2 rounded border border-slate-800 bg-slate-950/60 px-2 py-2 text-xs"
                          >
                            <Checkbox
                              checked={pickSelection.has(pick.id)}
                              onChange={() =>
                                isProposer
                                  ? props.onToggleProposerPick(pick.id)
                                  : props.onToggleCounterpartyPick(pick.id)
                              }
                              className="mt-0.5"
                            />
                            <span className="block font-medium text-slate-100 truncate">
                              {pick.label}
                            </span>
                          </label>
                        ))}
                        {pool.picks.length === 0 && (
                          <p className="text-xs text-slate-500 py-2">No available picks</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </DashboardCard>
        </div>

        {/* Secondary Panel: Validation & Impact */}
        <div className="space-y-6 xl:sticky xl:top-6">
          <TradeValidationPanel
            evaluation={currentEvaluation}
            status={props.detail?.proposal.status ?? "DRAFT"}
            showSubmissionGuidance={true}
            compact={true}
            testId="trade-builder-validation"
          />

          <TradeImpactSummary
            impact={currentEvaluation?.postTradeProjection ?? null}
            compact={true}
            testId="trade-builder-impact"
          />

          {/* Trade Actions */}
          <DashboardCard
            title="Trade Actions"
            description="Save the package, then validate, then submit."
            testId="trade-builder-actions"
          >
            <div className="space-y-3">
              <Button
                type="button"
                variant="secondary"
                onClick={props.onSaveDraft}
                disabled={Boolean(props.busyLabel) || selectedCount === 0}
                loading={props.busyLabel === "save"}
                className="w-full"
              >
                {props.busyLabel === "save" ? "Saving..." : "Save Draft"}
              </Button>

              <button
                type="button"
                onClick={props.onValidate}
                disabled={Boolean(props.busyLabel) || !canValidate}
                title={props.isDirty ? "Save changes before validating" : undefined}
                className="w-full rounded-lg border border-sky-700/50 bg-sky-950/40 px-3 py-2 text-sm font-medium text-sky-100 hover:border-sky-500 disabled:opacity-60"
              >
                {props.busyLabel === "validate" ? "Validating..." : "Run Validation"}
              </button>
              
              {isHardBlocked ? (
                <div className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-3 text-sm text-rose-100">
                  <p className="font-medium mb-1">Submission Blocked</p>
                  <p>Resolve validation findings before submitting this proposal.</p>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="primary"
                  onClick={props.onSubmit}
                  disabled={Boolean(props.busyLabel) || !canSubmit}
                  loading={props.busyLabel === "submit"}
                  className="w-full"
                  title={
                    props.isDirty
                      ? "Save changes before submitting"
                      : !currentEvaluation
                        ? "Run validation before submitting"
                        : undefined
                  }
                >
                  {props.busyLabel === "submit" ? "Submitting..." : "Submit Proposal"}
                </Button>
              )}
            </div>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
