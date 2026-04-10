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

const POSITION_COLORS: Record<string, { badge: string; bar: string }> = {
  QB: { badge: "text-purple-300 bg-purple-900/40 border-purple-700/50", bar: "bg-purple-500/60" },
  RB: { badge: "text-emerald-300 bg-emerald-900/40 border-emerald-700/50", bar: "bg-emerald-500/60" },
  WR: { badge: "text-sky-300 bg-sky-900/40 border-sky-700/50", bar: "bg-sky-500/60" },
  TE: { badge: "text-amber-300 bg-amber-900/40 border-amber-700/50", bar: "bg-amber-500/60" },
  K:  { badge: "text-slate-300 bg-slate-800/60 border-slate-700/50", bar: "bg-slate-500/60" },
};

function positionStyle(position: string) {
  return POSITION_COLORS[position] ?? { badge: "text-slate-300 bg-slate-800/60 border-slate-700/50", bar: "bg-slate-500/60" };
}

function capSharePercent(salary: number, capTotal: number | null): number {
  if (!capTotal || capTotal <= 0) return 0;
  return Math.min(100, (salary / capTotal) * 100);
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
  capTotal: number | null;
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
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${positionStyle(contract.player.position).badge}`}>
                    {contract.player.position}
                  </span>
                  <div>
                    <Link
                      href={`/players/${contract.player.id}`}
                      className="font-medium text-slate-100 hover:text-sky-300"
                    >
                      {contract.player.name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {contract.player.nflTeam ?? "FA"}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3 align-top">
                <div className="flex flex-col items-end gap-1">
                  <span className="font-mono text-slate-200">{formatMoney(contract.salary)}</span>
                  <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all ${positionStyle(contract.player.position).bar}`}
                      style={{ width: `${capSharePercent(contract.salary, props.capTotal)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {props.capTotal && props.capTotal > 0
                      ? `${capSharePercent(contract.salary, props.capTotal).toFixed(1)}% of cap`
                      : ""}
                  </span>
                </div>
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