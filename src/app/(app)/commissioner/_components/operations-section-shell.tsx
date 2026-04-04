"use client";

import { useState, type ReactNode } from "react";

export function OperationsSectionShell(props: {
  id: string;
  title: string;
  description: string;
  summary: string;
  testId: string;
  defaultOpen?: boolean;
  tone?: "default" | "warning" | "danger";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(props.defaultOpen));
  const toneClasses =
    props.tone === "danger"
      ? "border-red-700/60 bg-red-950/15"
      : props.tone === "warning"
        ? "border-amber-800/40 bg-amber-950/10"
        : "border-slate-800/80 bg-slate-950/30";

  return (
    <section
      id={props.id}
      data-testid={props.testId}
      className={`scroll-mt-24 rounded-lg border p-4 ${toneClasses}`}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
        data-testid={`${props.testId}-toggle`}
        aria-expanded={open}
      >
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{props.title}</h3>
          <p className="mt-1 text-xs text-slate-400">{props.description}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1 text-xs text-slate-300">
            {props.summary}
          </span>
          <span className="rounded-full border border-slate-700 px-2 py-1 text-[11px] text-slate-300">
            {open ? "Collapse" : "Expand"}
          </span>
        </div>
      </button>
      {open ? <div className="mt-4 space-y-4">{props.children}</div> : null}
    </section>
  );
}
