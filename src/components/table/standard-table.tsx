import { ReactNode } from "react";

type TableAlign = "left" | "right" | "center";
export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";
export type TableDensity = "comfortable" | "compact";

function alignClass(align: TableAlign) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function tableCellPaddingClass(density: TableDensity) {
  return density === "compact" ? "px-3 py-1.5" : "px-3 py-2";
}

export function StandardTable({
  children,
  testId,
  keyboardScrollable = false,
  ariaLabel,
}: {
  children: ReactNode;
  testId?: string;
  keyboardScrollable?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div
      className={`overflow-x-auto rounded-lg border border-[var(--brand-structure-muted)] ${
        keyboardScrollable ? "keyboard-scroll-region" : ""
      }`}
      data-testid={testId}
      tabIndex={keyboardScrollable ? 0 : undefined}
      role={keyboardScrollable ? "region" : undefined}
      aria-label={keyboardScrollable ? ariaLabel ?? "Scrollable table region" : undefined}
    >
      {children}
    </div>
  );
}

export function StickyHeaderCell({
  children,
  align = "left",
}: {
  children: ReactNode;
  align?: TableAlign;
}) {
  return (
    <th
      className={`sticky top-0 z-20 border-b border-[var(--brand-structure-muted)] bg-[var(--brand-surface-card)] px-3 py-2 font-medium ${alignClass(align)}`}
    >
      {children}
    </th>
  );
}

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  return (
    <span
      className="status-pill inline-flex rounded-full border px-2 py-1 text-xs font-medium"
      data-testid="table-status-pill"
      data-tone={tone}
    >
      {label}
    </span>
  );
}

export function complianceStatusMeta(status: "ok" | "warning" | "error") {
  if (status === "ok") {
    return { label: "OK", tone: "success" as const };
  }

  if (status === "warning") {
    return { label: "Warning", tone: "warning" as const };
  }

  return { label: "Error", tone: "danger" as const };
}

export function pickStatusMeta(status: "available" | "used") {
  if (status === "available") {
    return { label: "Available", tone: "success" as const };
  }

  return { label: "Used", tone: "neutral" as const };
}

export function tradeStatusMeta(
  status: "PROPOSED" | "APPROVED" | "PROCESSED" | "REJECTED" | "CANCELED",
) {
  if (status === "PROPOSED") {
    return { label: "PROPOSED", tone: "info" as const };
  }

  if (status === "APPROVED") {
    return { label: "APPROVED", tone: "warning" as const };
  }

  if (status === "PROCESSED") {
    return { label: "PROCESSED", tone: "success" as const };
  }

  if (status === "REJECTED") {
    return { label: "REJECTED", tone: "danger" as const };
  }

  return { label: "CANCELED", tone: "neutral" as const };
}
