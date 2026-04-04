"use client";

import { type FormEvent, useState } from "react";
import type { LeagueMembersSummary } from "@/components/teams/league-members-workspace";

export function LeagueSizeControl({
  summary,
  onChangeLeagueSize,
  busyAction,
}: {
  summary: LeagueMembersSummary;
  onChangeLeagueSize?: (newSize: number) => Promise<void>;
  busyAction: string | null;
}) {
  const [showSizeForm, setShowSizeForm] = useState(false);
  const [newSize, setNewSize] = useState(summary.totalSlots.toString());
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const size = parseInt(newSize, 10);

    if (size < summary.filledSlots) {
      alert(`Cannot reduce league size below ${summary.filledSlots} (current filled teams)`);
      return;
    }

    if (size < 4 || size > 32) {
      alert("League size must be between 4 and 32 teams");
      return;
    }

    setLoading(true);
    try {
      if (onChangeLeagueSize) {
        await onChangeLeagueSize(size);
        setShowSizeForm(false);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!summary.canChangeSize || !onChangeLeagueSize) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {!showSizeForm ? (
        <button
          onClick={() => setShowSizeForm(true)}
          className="rounded-md border border-slate-600/50 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:bg-slate-700/50 transition"
          disabled={Boolean(busyAction)}
        >
          Change Size
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="number"
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            min={Math.max(4, summary.filledSlots)}
            max={32}
            className="w-16 rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
            disabled={loading}
          />
          <button
            type="submit"
            className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            disabled={loading || Boolean(busyAction)}
          >
            {loading ? "..." : "Set"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSizeForm(false);
              setNewSize(summary.totalSlots.toString());
            }}
            className="rounded bg-slate-600 px-2 py-1 text-xs font-medium text-white hover:bg-slate-500"
            disabled={loading}
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
