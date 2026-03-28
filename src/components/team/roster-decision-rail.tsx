import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { ImpactPreviewPanel } from "@/components/team/impact-preview-panel";
import { Button } from "@/components/ui";
import type { ContractImpactPreview, TeamCapDetailProjection } from "@/types/detail";

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toLocaleString()}`;
}

export function RosterDecisionRail(props: {
  detail: TeamCapDetailProjection;
  selectedContract: TeamCapDetailProjection["contracts"][number] | null;
  canPreview: boolean;
  preview: ContractImpactPreview | null;
  previewLoadingLabel: string | null;
  previewError: string | null;
  onPreviewFranchiseTag: (contractId: string) => void;
  onPreviewRookieOption: (contractId: string) => void;
  testId?: string;
}) {
  const expiringContracts = props.detail.contracts.filter(
    (contract) => contract.status === "EXPIRING" || contract.yearsRemaining <= 1,
  );

  const tagCandidates = props.detail.contracts.filter(
    (contract) => !contract.isFranchiseTag && contract.status === "ACTIVE",
  );

  const optionCandidates = props.detail.contracts.filter(
    (contract) => contract.rookieOptionEligible && !contract.rookieOptionExercised,
  );

  return (
    <div className="space-y-6" data-testid={props.testId}>
      {props.selectedContract ? (
        <DashboardCard
          title="Decision Workspace"
          eyebrow={`Selected Player: ${props.selectedContract.player.name}`}
          description="Contract analysis and available actions for your selection."
          testId="contract-decision-workspace"
        >
          <div className="space-y-4">
            {/* Contract Overview */}
            <div className="rounded-lg border border-sky-800/50 bg-sky-950/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-sky-100">{props.selectedContract.player.name}</h4>
                  <div className="mt-1 flex items-center gap-4 text-sm text-slate-300">
                    <span>{props.selectedContract.player.position}</span>
                    <span>•</span>
                    <span>{props.selectedContract.player.nflTeam ?? "FA"}</span>
                    <span>•</span>
                    <span className="font-mono font-medium">{formatMoney(props.selectedContract.salary)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-slate-200">
                      {props.selectedContract.yearsRemaining}/{props.selectedContract.yearsTotal} years
                    </span>
                    {props.selectedContract.isFranchiseTag && (
                      <span className="rounded border border-amber-600 bg-amber-950 px-2 py-1 text-amber-200">
                        Franchise Tagged
                      </span>
                    )}
                    {props.selectedContract.rookieOptionEligible && !props.selectedContract.rookieOptionExercised && (
                      <span className="rounded border border-sky-600 bg-sky-950 px-2 py-1 text-sky-200">
                        Option Eligible
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  <div className="rounded border border-slate-700 bg-slate-800 p-2 text-center">
                    <div className="font-medium text-slate-200">Selected</div>
                    <div className="mt-1 text-slate-400">Contract ID</div>
                    <div className="font-mono text-[10px] text-slate-500">{props.selectedContract.id.slice(-8)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Available Actions */}
            {props.canPreview && (
              <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
                <h5 className="mb-3 text-sm font-semibold text-slate-100">Available Contract Actions</h5>
                <div className="space-y-3">
                  {!props.selectedContract.isFranchiseTag ? (
                    <div className="flex items-start gap-3 rounded border border-amber-700/50 bg-amber-950/20 p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-100">Franchise Tag Option</p>
                        <p className="mt-1 text-xs text-amber-200/80">Preview the impact of applying a franchise tag to this player.</p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary" 
                        size="sm"
                        onClick={() => props.onPreviewFranchiseTag(props.selectedContract!.id)}
                        className="border-amber-700 text-amber-100 hover:border-amber-500 hover:bg-amber-950/40"
                      >
                        Preview Impact
                      </Button>
                    </div>
                  ) : null}
                  
                  {props.selectedContract.rookieOptionEligible && !props.selectedContract.rookieOptionExercised ? (
                    <div className="flex items-start gap-3 rounded border border-sky-700/50 bg-sky-950/20 p-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-sky-100">Rookie Option Exercise</p>
                        <p className="mt-1 text-xs text-sky-200/80">Preview the impact of exercising the fifth-year rookie option.</p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => props.onPreviewRookieOption(props.selectedContract!.id)}
                        className="border-sky-700 text-sky-100 hover:border-sky-500 hover:bg-sky-950/40"
                      >
                        Preview Impact
                      </Button>
                    </div>
                  ) : null}
                  
                  {!props.selectedContract.isFranchiseTag && !props.selectedContract.rookieOptionEligible ? (
                    <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-center">
                      <p className="text-sm text-slate-400">No additional contract actions available.</p>
                      <p className="mt-1 text-xs text-slate-500">Cut impact preview is available from the table.</p>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </DashboardCard>
      ) : (
        <DashboardCard
          title="Select a Contract"
          eyebrow="Decision Workspace"  
          description="Click any table row to begin analyzing contract options and impact."
          testId="contract-selection-prompt"
        >
          <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-6 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-slate-600 bg-slate-700 flex items-center justify-center">
              <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-200">No contract selected</p>
            <p className="mt-1 text-xs text-slate-500">Select a player from the table above to view available actions and preview their impact.</p>
          </div>
        </DashboardCard>
      )}

      {/* Impact Preview - Always show with contextual messaging */}
      <ImpactPreviewPanel
        preview={props.preview}
        loadingLabel={props.previewLoadingLabel}
        error={props.previewError}
        selectedPlayerName={props.selectedContract?.player.name ?? null}
        emptyMessage={props.selectedContract 
          ? `Select an action above to preview ${props.selectedContract.player.name}'s impact on your team.`
          : "Select a player action to preview impact on cap, roster, and compliance."
        }
        testId="team-impact-preview"
      />

      {/* Action Candidates - Lower priority when selection is active */}
      <DashboardCard
        title={props.selectedContract ? "Reference: All Candidates" : "Action Candidates"}
        eyebrow={props.selectedContract ? "Reference Information" : "Action Planning"}
        description={props.selectedContract 
          ? "Other players requiring attention across your roster."
          : "These players and issues are the fastest path to roster or cap pressure."
        }
        testId="team-action-candidates"
      >
        <div className="space-y-4">
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

      <ImpactPreviewPanel
        preview={props.preview}
        loadingLabel={props.previewLoadingLabel}
        error={props.previewError}
        emptyMessage="Select a player action to preview impact on cap, roster, and compliance."
        testId="team-impact-preview"
      />
    </div>
  );
}