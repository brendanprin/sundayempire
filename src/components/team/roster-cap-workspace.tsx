"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { MirrorOnlyBanner } from "@/components/layout/mirror-only-banner";
import { RosterHealthSummaryRow } from "@/components/team/roster-health-summary-row";
import { RosterContractsToolbar, type ContractFilterId, type ContractSortId } from "@/components/team/roster-contracts-toolbar";
import { RosterPlayerTable } from "@/components/team/roster-player-table";
import { CutDecisionModal } from "@/components/team/cut-decision-modal";
import type { ContractImpactPreview, TeamCapDetailProjection } from "@/types/detail";

type ViewerRole = "COMMISSIONER" | "MEMBER";

function contractHasDeadCap(
  contract: TeamCapDetailProjection["contracts"][number],
  deadCapSourceContractIds: Set<string>,
) {
  return deadCapSourceContractIds.has(contract.id);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Unavailable";
  }

  return new Date(value).toLocaleString();
}

export function RosterCapWorkspace(props: {
  detail: TeamCapDetailProjection;
  viewerRole: ViewerRole;
  viewerTeamId: string | null;
  preview: ContractImpactPreview | null;
  previewLoadingLabel: string | null;
  previewError: string | null;
  onPreviewCut: (playerId: string) => void;
  onConfirmCut?: (playerId: string) => Promise<void>;
  onPreviewFranchiseTag: (contractId: string) => void;
  onPreviewRookieOption: (contractId: string) => void;
}) {
  const canPreview =
    props.viewerRole === "COMMISSIONER" ||
    (props.viewerRole === "MEMBER" && props.viewerTeamId === props.detail.team.id);

  const [contractQuery, setContractQuery] = useState("");
  const [contractFilter, setContractFilter] = useState<ContractFilterId>("all");
  const [contractSort, setContractSort] = useState<ContractSortId>("salary-desc");
  const [cutModalOpen, setCutModalOpen] = useState(false);
  const [cutModalContractId, setCutModalContractId] = useState<string | null>(null);
  const deferredContractQuery = useDeferredValue(contractQuery);

  const deadCapSourceContractIds = useMemo(() => {
    return new Set(
      props.detail.deadCap.charges
        .map((charge) => charge.sourceContractId)
        .filter((id): id is string => id !== null),
    );
  }, [props.detail.deadCap.charges]);

  const contractRows = useMemo(() => {
    const search = deferredContractQuery.toLowerCase().trim();

    return props.detail.contracts
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
          return left.status.localeCompare(right.status);
        }

        // Default: salary-desc
        return right.salary - left.salary;
      });
  }, [props.detail.contracts, deferredContractQuery, contractFilter, contractSort, deadCapSourceContractIds]);

  const cutModalContract = useMemo(() => {
    return cutModalContractId 
      ? props.detail.contracts.find(contract => contract.id === cutModalContractId) ?? null
      : null;
  }, [cutModalContractId, props.detail.contracts]);

  function handlePreviewCut(playerId: string) {
    // Find the contract for this player
    const contract = props.detail.contracts.find(c => c.player.id === playerId);
    if (contract) {
      setCutModalContractId(contract.id);
      setCutModalOpen(true);
      // Also trigger the preview data loading
      props.onPreviewCut(playerId);
    }
  }

  function closeCutModal() {
    setCutModalOpen(false);
    // Keep the contract ID for a moment in case there's a retry
    setTimeout(() => {
      setCutModalContractId(null);
    }, 300);
  }

  return (
    <div className="space-y-6" data-testid="team-cap-detail">
      <PageHeaderBand
        eyebrow="My Team"
        title="My Roster / Cap"
        description="Review roster posture, contracts, dead cap, and compliance from one canonical manager workspace."
        titleTestId="team-header-title"
        supportingContent={
          <p className="text-sm text-slate-400">
            Last recalculated {formatDateTime(props.detail.capSummary.lastRecalculatedAt)}
          </p>
        }
      />

      {props.detail.capSummary.mirrorOnly ? (
        <MirrorOnlyBanner
          message="Roster management is mirror-only during regular season"
          detail="Use your host platform for lineup changes. This workspace provides cap, contract, and compliance visibility."
        />
      ) : null}

      {!props.detail.availability.teamSeasonStateAvailable ? (
        <div className="shell-panel">
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-100">
            Team season state is partially unavailable. Cap and roster numbers may be
            missing detail until the next successful recalculation.
          </div>
        </div>
      ) : null}

      <RosterHealthSummaryRow 
        detail={props.detail} 
        testId="team-summary-strip"
      />

      {/* Contracts Area - Full Width */}
      <div className="shell-panel">
        <RosterContractsToolbar
          contractQuery={contractQuery}
          contractFilter={contractFilter}
          contractSort={contractSort}
          contractCount={props.detail.contracts.length}
          filteredCount={contractRows.length}
          onQueryChange={setContractQuery}
          onFilterChange={setContractFilter}
          onSortChange={setContractSort}
          testId="roster-contracts-toolbar"
        />
        
        {!canPreview && (
          <div className="px-6 py-4 border-b border-slate-800 bg-amber-950/10">
            <div className="text-sm text-amber-200">
              Contract actions remain preview-only here. Commissioners and members assigned to this team
              can run previews to inspect impact before any downstream action.
            </div>
          </div>
        )}
        
        <RosterPlayerTable
          contracts={contractRows}
          deadCapSourceContractIds={deadCapSourceContractIds}
          capTotal={props.detail.capSummary.activeCapTotal}
          canPreview={canPreview}
          selectedContractId={null}
          onContractSelect={() => {}}
          onPreviewCut={handlePreviewCut}
          onPreviewFranchiseTag={props.onPreviewFranchiseTag}
          onPreviewRookieOption={props.onPreviewRookieOption}
          testId="roster-player-table"
        />
      </div>

      {/* Cut Decision Modal */}
      <CutDecisionModal
        isOpen={cutModalOpen}
        onClose={closeCutModal}
        contract={cutModalContract}
        preview={props.preview}
        previewLoadingLabel={props.previewLoadingLabel}
        previewError={props.previewError}
        onPreviewCut={handlePreviewCut}
        onConfirmCut={props.onConfirmCut}
        testId="cut-decision-modal"
      />
    </div>
  );
}
