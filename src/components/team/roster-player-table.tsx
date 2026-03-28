"use client";

import Link from "next/link";
import { StandardTable } from "@/components/table/standard-table";
import { Button } from "@/components/ui";
import { formatEnumLabel } from "@/lib/format-label";
import type { TeamCapDetailProjection } from "@/types/detail";

function formatMoney(value: number | null) {
  if (value === null) {
    return "-";
  }

  return `$${value.toLocaleString()}`;
}

type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

function badgeClasses(tone: StatusTone) {
  switch (tone) {
    case "success":
      return "border-green-700/50 bg-green-950/30 text-green-200";
    case "warning":
      return "border-amber-700/50 bg-amber-950/30 text-amber-200";
    case "danger":
      return "border-red-700/50 bg-red-950/30 text-red-200";
    case "info":
      return "border-sky-700/50 bg-sky-950/30 text-sky-200";
    case "neutral":
    default:
      return "border-slate-700/50 bg-slate-800/50 text-slate-300";
  }
}

function contractHasDeadCap(
  contract: TeamCapDetailProjection["contracts"][number],
  deadCapSourceContractIds: Set<string>,
) {
  return deadCapSourceContractIds.has(contract.id);
}

export function RosterPlayerTable(props: {
  contracts: TeamCapDetailProjection["contracts"];
  deadCapSourceContractIds: Set<string>;
  canPreview: boolean;
  selectedContractId: string | null;
  onContractSelect: (contractId: string | null) => void;
  onPreviewCut: (playerId: string) => void;
  onPreviewFranchiseTag: (contractId: string) => void;
  onPreviewRookieOption: (contractId: string) => void;
  testId?: string;
}) {
  if (props.contracts.length === 0) {
    return (
      <StandardTable testId={props.testId}>
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-800 text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Player</th>
              <th className="px-3 py-2 text-right font-medium">Salary</th>
              <th className="px-3 py-2 text-right font-medium">Years</th>
              <th className="px-3 py-2 text-left font-medium">Contract State</th>
              <th className="px-3 py-2 text-left font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                No contracts match the current filters. Clear the search or switch filters to review more contract decisions.
              </td>
            </tr>
          </tbody>
        </table>
      </StandardTable>
    );
  }

  return (
    <StandardTable testId={props.testId} keyboardScrollable ariaLabel="Player contracts table">
      <table className="min-w-full text-sm">
        <thead className="border-b border-slate-800 text-slate-400">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Player</th>
            <th className="px-3 py-2 text-right font-medium">Salary</th>
            <th className="px-3 py-2 text-right font-medium">Years</th>
            <th className="px-3 py-2 text-left font-medium">Contract State</th>
            <th className="px-3 py-2 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.contracts.map((contract) => {
            const isSelected = props.selectedContractId === contract.id;
            return (
            <tr 
              key={contract.id} 
              className={`border-b border-slate-800/70 last:border-b-0 cursor-pointer transition-colors ${
                isSelected 
                  ? "bg-sky-950/30 border-sky-800/50" 
                  : "hover:bg-slate-900/30"
              }`}
              onClick={() => props.onContractSelect(isSelected ? null : contract.id)}
            >
              <td className="px-3 py-3 align-top">
                <Link 
                  href={`/players/${contract.player.id}`} 
                  className="font-medium text-slate-100 hover:text-sky-300"
                >
                  {contract.player.name}
                </Link>
                <p className="text-xs text-slate-400">
                  {contract.player.position} · {contract.player.nflTeam ?? "FA"}
                </p>
              </td>
              <td className="px-3 py-3 text-right align-top font-mono">
                {formatMoney(contract.salary)}
              </td>
              <td className="px-3 py-3 text-right align-top font-mono">
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
                  {contractHasDeadCap(contract, props.deadCapSourceContractIds) ? (
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${badgeClasses("danger")}`}>
                      Dead cap relevant
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                {props.canPreview ? (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      props.onPreviewCut(contract.player.id);
                    }}
                  >
                    Cut Analysis
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">
                    Limited access
                  </p>
                )}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </StandardTable>
  );
}