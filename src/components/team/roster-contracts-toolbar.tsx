"use client";

import { useDeferredValue } from "react";
import { Input, Select } from "@/components/ui";

export type ContractFilterId = "all" | "action-needed" | "expiring" | "tagged" | "option" | "dead-cap";
export type ContractSortId = "salary-desc" | "salary-asc" | "years-desc" | "player-asc" | "status-asc";

export function RosterContractsToolbar(props: {
  contractQuery: string;
  contractFilter: ContractFilterId;
  contractSort: ContractSortId;
  contractCount: number;
  filteredCount: number;
  onQueryChange: (query: string) => void;
  onFilterChange: (filter: ContractFilterId) => void;
  onSortChange: (sort: ContractSortId) => void;
  testId?: string;
}) {
  const deferredQuery = useDeferredValue(props.contractQuery);

  const filterOptions: Array<[ContractFilterId, string]> = [
    ["all", "All contracts"],
    ["action-needed", "Action needed"],
    ["expiring", "Expiring"],
    ["tagged", "Tagged"],
    ["option", "Option eligible"],
    ["dead-cap", "Dead cap relevant"],
  ];

  return (
    <div className="border-b border-slate-800 bg-slate-950/50 px-6 py-5" data-testid={props.testId}>
      {/* Row 1: Search + Sort */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <Input
            type="search"
            value={props.contractQuery}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search contracts by player, team, or status"
            className="w-full"
          />
        </div>
        <div className="flex-shrink-0 w-52">
          <Select
            value={props.contractSort}
            onChange={(event) => props.onSortChange(event.target.value as ContractSortId)}
            className="w-full"
          >
            <option value="salary-desc">Salary: high to low</option>
            <option value="salary-asc">Salary: low to high</option>
            <option value="years-desc">Years remaining</option>
            <option value="player-asc">Player name</option>
            <option value="status-asc">Contract status</option>
          </Select>
        </div>
      </div>

      {/* Row 2: Filter chips + count */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(([filterId, label]) => (
            <button
              key={filterId}
              type="button"
              onClick={() => props.onFilterChange(filterId)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                props.contractFilter === filterId
                  ? "border-sky-700/70 bg-sky-950/20 text-sky-100"
                  : "border-slate-700/60 bg-slate-900/80 text-slate-300 hover:border-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-shrink-0 text-sm text-slate-400">
          {props.filteredCount} of {props.contractCount} contract{props.contractCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
}