"use client";

import { useDeferredValue } from "react";
import { Input, Select, Button } from "@/components/ui";

export type ContractFilterId = "all" | "action-needed" | "expiring" | "tagged" | "option" | "dead-cap";
export type ContractSortId = "salary-desc" | "salary-asc" | "years-desc" | "player-asc" | "status-asc";

export function RosterFilterBar(props: {
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
    <div className="space-y-4" data-testid={props.testId}>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-sm text-slate-300 sm:min-w-[220px]">
          Search contracts
          <Input
            type="search"
            value={props.contractQuery}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Search player, team, or status"
          />
        </label>
        <label className="flex min-w-0 flex-col gap-2 text-sm text-slate-300 sm:min-w-[180px]">
          Sort rows
          <Select
            value={props.contractSort}
            onChange={(event) => props.onSortChange(event.target.value as ContractSortId)}
          >
            <option value="salary-desc">Salary: high to low</option>
            <option value="salary-asc">Salary: low to high</option>
            <option value="years-desc">Years remaining</option>
            <option value="player-asc">Player name</option>
            <option value="status-asc">Contract status</option>
          </Select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        {filterOptions.map(([filterId, label]) => (
          <button
            key={filterId}
            type="button"
            onClick={() => props.onFilterChange(filterId)}
            className={`rounded-full border px-3 py-1 text-xs ${
              props.contractFilter === filterId
                ? "border-sky-700/70 bg-sky-950/20 text-sky-100"
                : "border-slate-700/60 bg-slate-900 text-slate-300 hover:border-slate-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="text-sm text-slate-400">
        Showing {props.filteredCount} of {props.contractCount} contract row
        {props.contractCount === 1 ? "" : "s"}.
      </p>
    </div>
  );
}