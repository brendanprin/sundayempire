"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui";

type TableFilterValue = string | number | boolean | null;

export type TableFilterState = Record<string, TableFilterValue>;

type StoredFilterState = {
  current: Record<string, unknown>;
  saved: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStoredFilterState(raw: string | null): StoredFilterState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { current?: unknown; saved?: unknown };
    if (!isRecord(parsed.current)) {
      return null;
    }

    if (parsed.saved !== null && parsed.saved !== undefined && !isRecord(parsed.saved)) {
      return null;
    }

    return {
      current: parsed.current,
      saved: parsed.saved ? parsed.saved : null,
    };
  } catch {
    return null;
  }
}

function mergeFilterState<T extends TableFilterState>(base: T, incoming: Record<string, unknown>): T {
  const next = { ...base };

  for (const key of Object.keys(base) as Array<keyof T>) {
    if (!(key in incoming)) {
      continue;
    }

    const sourceValue = incoming[key as string];
    const baseValue = base[key];

    if (
      (sourceValue === null && baseValue === null) ||
      typeof sourceValue === typeof baseValue ||
      (typeof baseValue === "number" && typeof sourceValue === "string" && sourceValue.trim() !== "")
    ) {
      next[key] = sourceValue as T[keyof T];
    }
  }

  return next;
}

function getInitialSnapshot<T extends TableFilterState>(
  storageKey: string,
  initialFilters: T,
): {
  filters: T;
  savedFilters: T | null;
} {
  if (typeof window === "undefined") {
    return {
      filters: initialFilters,
      savedFilters: null,
    };
  }

  const stored = toStoredFilterState(window.localStorage.getItem(storageKey));
  if (!stored) {
    return {
      filters: initialFilters,
      savedFilters: null,
    };
  }

  return {
    filters: mergeFilterState(initialFilters, stored.current),
    savedFilters: stored.saved ? mergeFilterState(initialFilters, stored.saved) : null,
  };
}

export function useSavedTableFilters<T extends TableFilterState>({
  storageKey,
  initialFilters,
}: {
  storageKey: string;
  initialFilters: T;
}) {
  const [snapshot, setSnapshot] = useState(() => getInitialSnapshot(storageKey, initialFilters));

  const setFilters: Dispatch<SetStateAction<T>> = useCallback((next) => {
    setSnapshot((previous) => ({
      ...previous,
      filters:
        typeof next === "function"
          ? (next as (previousState: T) => T)(previous.filters)
          : next,
    }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        current: snapshot.filters,
        saved: snapshot.savedFilters,
      }),
    );
  }, [snapshot, storageKey]);

  const saveCurrentFilters = useCallback(() => {
    setSnapshot((previous) => ({
      ...previous,
      savedFilters: previous.filters,
    }));
  }, []);

  const applySavedFilters = useCallback(() => {
    setSnapshot((previous) => {
      if (!previous.savedFilters) return previous;

      return {
        ...previous,
        filters: previous.savedFilters,
      };
    });
  }, []);

  const clearSavedFilters = useCallback(() => {
    setSnapshot((previous) => ({
      ...previous,
      savedFilters: null,
    }));
  }, []);

  const resetFilters = useCallback(() => {
    setSnapshot((previous) => ({
      ...previous,
      filters: initialFilters,
    }));
  }, [initialFilters]);

  return {
    filters: snapshot.filters,
    setFilters,
    savedFilters: snapshot.savedFilters,
    hasSavedFilters: snapshot.savedFilters !== null,
    saveCurrentFilters,
    applySavedFilters,
    clearSavedFilters,
    resetFilters,
  };
}

export function applyQuickFilter<T extends TableFilterState>(
  setFilters: Dispatch<SetStateAction<T>>,
  values: Partial<T>,
) {
  setFilters((previous) => ({ ...previous, ...values }));
}

export function matchesQuickFilter<T extends TableFilterState>(filters: T, values: Partial<T>) {
  for (const key of Object.keys(values) as Array<keyof T>) {
    if (filters[key] !== values[key]) {
      return false;
    }
  }

  return true;
}

type TableQuickFilterChip = {
  id: string;
  label: string;
  active: boolean;
  onClick: () => void;
};

export function TableFilterToolbar({
  testIdPrefix,
  title,
  chips,
  hasSavedFilters,
  onSaveCurrent,
  onApplySaved,
  onClearSaved,
  onReset,
}: {
  testIdPrefix: string;
  title?: string;
  chips: TableQuickFilterChip[];
  hasSavedFilters: boolean;
  onSaveCurrent: () => void;
  onApplySaved: () => void;
  onClearSaved: () => void;
  onReset: () => void;
}) {
  return (
    <section
      className="space-y-3 rounded-lg border border-[var(--brand-structure-muted)] bg-[var(--brand-surface-card)] p-3"
      data-testid={`${testIdPrefix}-toolbar`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-structure)]">
          {title ?? "Quick Filters"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="subtle"
            size="sm"
            onClick={onSaveCurrent}
            data-testid={`${testIdPrefix}-save`}
          >
            Save Current
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={onApplySaved}
            disabled={!hasSavedFilters}
            data-testid={`${testIdPrefix}-apply-saved`}
          >
            Apply Saved
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={onClearSaved}
            disabled={!hasSavedFilters}
            data-testid={`${testIdPrefix}-clear-saved`}
          >
            Clear Saved
          </Button>
          <Button
            variant="subtle"
            size="sm"
            onClick={onReset}
            data-testid={`${testIdPrefix}-reset`}
          >
            Reset
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={chip.onClick}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              chip.active
                ? "border-[var(--brand-accent-primary)] bg-[var(--brand-accent-soft)] text-[var(--brand-accent-primary)]"
                : "border-[var(--brand-structure-muted)] bg-[var(--brand-surface-muted)] text-[var(--foreground)] hover:border-[var(--brand-structure)]"
            }`}
            data-testid={`${testIdPrefix}-chip-${chip.id}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
    </section>
  );
}
