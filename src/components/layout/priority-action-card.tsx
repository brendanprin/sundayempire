"use client";

import Link from "next/link";

export type ActionUrgency = "critical" | "needs_action" | "on_radar";

function urgencyMeta(urgency: ActionUrgency) {
  if (urgency === "critical") {
    return {
      badgeLabel: "Critical",
      badgeClass: "border-red-700/50 bg-red-950/30 text-red-200",
    };
  }

  if (urgency === "needs_action") {
    return {
      badgeLabel: "Needs Action",
      badgeClass: "border-amber-700/50 bg-amber-950/30 text-amber-200",
    };
  }

  return {
    badgeLabel: "On Radar",
    badgeClass: "border-slate-700/60 bg-slate-900 text-slate-300",
  };
}

export function PriorityActionCard({
  title,
  description,
  href,
  ctaLabel,
  urgency,
  testId,
  linkTestId,
  onSelect,
}: {
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  urgency: ActionUrgency;
  testId: string;
  linkTestId: string;
  onSelect?: () => void;
}) {
  const meta = urgencyMeta(urgency);

  return (
    <article className="rounded-md border border-slate-800 bg-slate-900 px-3 py-3" data-testid={testId}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-100">{title}</p>
          <p className="mt-1 text-xs text-slate-400">{description}</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${meta.badgeClass}`}>
          {meta.badgeLabel}
        </span>
      </div>
      <div className="mt-3">
        <Link
          href={href}
          onClick={onSelect}
          className="inline-flex rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:border-slate-500"
          data-testid={linkTestId}
        >
          {ctaLabel}
        </Link>
      </div>
    </article>
  );
}
