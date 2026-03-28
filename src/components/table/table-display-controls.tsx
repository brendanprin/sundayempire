"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TableDensity } from "@/components/table/standard-table";import { Button, Checkbox } from "@/components/ui";
type TableDisplayColumn = {
  id: string;
  label: string;
  defaultVisible?: boolean;
  alwaysVisible?: boolean;
};

type DisplaySnapshot = {
  density: TableDensity;
  columnOrder: string[];
  hiddenColumnIds: string[];
};

type StoredDisplaySnapshot = {
  density?: unknown;
  columnOrder?: unknown;
  hiddenColumnIds?: unknown;
};

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function arraysEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function getColumnDefaults(columns: TableDisplayColumn[]) {
  const order = columns.map((column) => column.id);
  const hidden = columns
    .filter((column) => column.defaultVisible === false && !column.alwaysVisible)
    .map((column) => column.id);

  return {
    order,
    hidden,
  };
}

function normalizeOrder(order: string[], columns: TableDisplayColumn[]) {
  const allowedIds = new Set(columns.map((column) => column.id));
  const normalized = uniqueStrings(order.filter((id) => allowedIds.has(id)));

  for (const column of columns) {
    if (!normalized.includes(column.id)) {
      normalized.push(column.id);
    }
  }

  return normalized;
}

function normalizeHidden(hiddenColumnIds: string[], columns: TableDisplayColumn[]) {
  const allowedIds = new Set(columns.map((column) => column.id));
  const alwaysVisibleIds = new Set(
    columns.filter((column) => column.alwaysVisible).map((column) => column.id),
  );

  return uniqueStrings(
    hiddenColumnIds.filter((id) => allowedIds.has(id) && !alwaysVisibleIds.has(id)),
  );
}

function normalizeDensity(value: unknown, fallback: TableDensity): TableDensity {
  if (value === "compact" || value === "comfortable") {
    return value;
  }

  return fallback;
}

function parseStoredSnapshot(raw: string | null): StoredDisplaySnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as StoredDisplaySnapshot;
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function toInitialSnapshot(
  storageKey: string,
  columns: TableDisplayColumn[],
  defaultDensity: TableDensity,
): DisplaySnapshot {
  const defaults = getColumnDefaults(columns);

  if (typeof window === "undefined") {
    return {
      density: defaultDensity,
      columnOrder: defaults.order,
      hiddenColumnIds: defaults.hidden,
    };
  }

  const stored = parseStoredSnapshot(window.localStorage.getItem(storageKey));
  if (!stored) {
    return {
      density: defaultDensity,
      columnOrder: defaults.order,
      hiddenColumnIds: defaults.hidden,
    };
  }

  return {
    density: normalizeDensity(stored.density, defaultDensity),
    columnOrder: normalizeOrder(
      Array.isArray(stored.columnOrder)
        ? stored.columnOrder.filter((value): value is string => typeof value === "string")
        : defaults.order,
      columns,
    ),
    hiddenColumnIds: normalizeHidden(
      Array.isArray(stored.hiddenColumnIds)
        ? stored.hiddenColumnIds.filter((value): value is string => typeof value === "string")
        : defaults.hidden,
      columns,
    ),
  };
}

export function useTableDisplayPreferences({
  storageKey,
  columns,
  defaultDensity = "comfortable",
}: {
  storageKey: string;
  columns: TableDisplayColumn[];
  defaultDensity?: TableDensity;
}) {
  const [snapshot, setSnapshot] = useState<DisplaySnapshot>(() =>
    toInitialSnapshot(storageKey, columns, defaultDensity),
  );

  useEffect(() => {
    setSnapshot(toInitialSnapshot(storageKey, columns, defaultDensity));
  }, [storageKey, columns, defaultDensity]);

  const columnSignature = useMemo(
    () =>
      columns
        .map(
          (column) =>
            `${column.id}:${column.defaultVisible === false ? "hidden" : "visible"}:${column.alwaysVisible ? "locked" : "free"}`,
        )
        .join("|"),
    [columns],
  );

  useEffect(() => {
    setSnapshot((previous) => {
      const defaults = getColumnDefaults(columns);
      const next = {
        density: previous.density,
        columnOrder: normalizeOrder(previous.columnOrder, columns),
        hiddenColumnIds:
          previous.hiddenColumnIds.length === 0 && previous.columnOrder.length === 0
            ? defaults.hidden
            : normalizeHidden(previous.hiddenColumnIds, columns),
      };

      if (
        previous.density === next.density &&
        arraysEqual(previous.columnOrder, next.columnOrder) &&
        arraysEqual(previous.hiddenColumnIds, next.hiddenColumnIds)
      ) {
        return previous;
      }

      return next;
    });
  }, [columnSignature, columns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(snapshot));
  }, [snapshot, storageKey]);

  const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);

  const orderedColumns = useMemo(
    () =>
      snapshot.columnOrder
        .map((columnId) => columnById.get(columnId))
        .filter((column): column is TableDisplayColumn => Boolean(column)),
    [columnById, snapshot.columnOrder],
  );

  const isColumnVisible = useCallback(
    (columnId: string) => !snapshot.hiddenColumnIds.includes(columnId),
    [snapshot.hiddenColumnIds],
  );

  const toggleDensity = useCallback(() => {
    setSnapshot((previous) => ({
      ...previous,
      density: previous.density === "comfortable" ? "compact" : "comfortable",
    }));
  }, []);

  const toggleColumn = useCallback(
    (columnId: string) => {
      const column = columnById.get(columnId);
      if (!column || column.alwaysVisible) {
        return;
      }

      setSnapshot((previous) => {
        const isHidden = previous.hiddenColumnIds.includes(columnId);
        return {
          ...previous,
          hiddenColumnIds: isHidden
            ? previous.hiddenColumnIds.filter((id) => id !== columnId)
            : [...previous.hiddenColumnIds, columnId],
        };
      });
    },
    [columnById],
  );

  const moveColumn = useCallback((columnId: string, direction: "up" | "down") => {
    setSnapshot((previous) => {
      const index = previous.columnOrder.indexOf(columnId);
      if (index === -1) {
        return previous;
      }

      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= previous.columnOrder.length) {
        return previous;
      }

      const nextOrder = [...previous.columnOrder];
      const [moved] = nextOrder.splice(index, 1);
      nextOrder.splice(targetIndex, 0, moved);

      return {
        ...previous,
        columnOrder: nextOrder,
      };
    });
  }, []);

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => isColumnVisible(column.id)),
    [isColumnVisible, orderedColumns],
  );

  return {
    density: snapshot.density,
    isCompact: snapshot.density === "compact",
    orderedColumns,
    visibleColumns,
    isColumnVisible,
    toggleDensity,
    toggleColumn,
    moveColumn,
  };
}

export function TableDisplayControls({
  testIdPrefix,
  title = "Table Display",
  density,
  orderedColumns,
  isColumnVisible,
  onToggleDensity,
  onToggleColumn,
  onMoveColumn,
}: {
  testIdPrefix: string;
  title?: string;
  density: TableDensity;
  orderedColumns: TableDisplayColumn[];
  isColumnVisible: (columnId: string) => boolean;
  onToggleDensity: () => void;
  onToggleColumn: (columnId: string) => void;
  onMoveColumn: (columnId: string, direction: "up" | "down") => void;
}) {
  return (
    <section
      className="space-y-3 rounded-lg border border-[var(--brand-structure-muted)] bg-[var(--brand-surface-card)] p-3"
      data-testid={`${testIdPrefix}-toolbar`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-structure)]">{title}</p>
        <Button
          variant="subtle"
          size="sm"
          onClick={onToggleDensity}
          data-testid={`${testIdPrefix}-density-toggle`}
        >
          Density: {density === "compact" ? "Compact" : "Comfortable"}
        </Button>
      </div>

      <ul className="grid grid-cols-1 gap-2 md:grid-cols-2" data-testid={`${testIdPrefix}-columns`}>
        {orderedColumns.map((column, index) => (
          <li
            key={column.id}
            className="flex items-center justify-between gap-2 rounded border border-[var(--brand-structure-muted)] bg-[var(--brand-surface-muted)] px-2 py-1.5"
          >
            <label className="flex items-center gap-2 text-xs text-[var(--foreground)]">
              <Checkbox
                checked={isColumnVisible(column.id)}
                disabled={column.alwaysVisible}
                onChange={() => onToggleColumn(column.id)}
                data-testid={`${testIdPrefix}-column-toggle-${column.id}`}
              />
              <span>{column.label}</span>
              {column.alwaysVisible ? (
                <span className="rounded border border-[var(--brand-structure-muted)] px-1 py-0.5 text-[10px] text-[var(--brand-structure)]">
                  Required
                </span>
              ) : null}
            </label>

            <div className="flex items-center gap-1">
              <Button
                variant="subtle"
                size="sm"
                onClick={() => onMoveColumn(column.id, "up")}
                disabled={index === 0}
                data-testid={`${testIdPrefix}-column-up-${column.id}`}
                aria-label={`Move ${column.label} up`}
                className="text-[10px] px-1.5 py-0.5"
              >
                Up
              </Button>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => onMoveColumn(column.id, "down")}
                disabled={index === orderedColumns.length - 1}
                data-testid={`${testIdPrefix}-column-down-${column.id}`}
                aria-label={`Move ${column.label} down`}
                className="text-[10px] px-1.5 py-0.5"
              >
                Down
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
