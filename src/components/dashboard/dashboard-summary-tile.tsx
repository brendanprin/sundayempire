import Link from "next/link";

type DashboardSummaryTone = "default" | "warning" | "critical" | "accent";

function toneClasses(tone: DashboardSummaryTone) {
  if (tone === "critical") {
    return "border-red-800/40 bg-red-950/15 text-red-100";
  }

  if (tone === "warning") {
    return "border-amber-700/40 bg-amber-950/15 text-amber-100";
  }

  if (tone === "accent") {
    return "border-sky-700/40 bg-sky-950/15 text-sky-100";
  }

  return "border-slate-800/50 bg-slate-950/30 text-slate-100";
}

export function DashboardSummaryTile(props: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  tone?: DashboardSummaryTone;
  testId?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  // Only make the whole tile clickable if there's an href but no separate action button
  const isWholeTileClickable = Boolean(props.actionHref && !props.actionLabel);
  const baseClasses = toneClasses(props.tone ?? "default");
  const interactionClasses = isWholeTileClickable 
    ? "cursor-pointer transition-all duration-200 hover:border-opacity-60 hover:shadow-[0_8px_32px_rgba(15,23,42,0.25)] hover:-translate-y-0.5" 
    : "";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] uppercase tracking-[0.2em] opacity-75">{props.eyebrow}</p>
        {props.actionHref && props.actionLabel ? (
          <Link
            href={props.actionHref}
            className="rounded-md border border-current/30 px-2 py-1 text-[11px] font-medium transition hover:bg-white/10 hover:border-current/50"
          >
            {props.actionLabel}
          </Link>
        ) : null}
      </div>
      <div className="mt-3">
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <p className="mt-3 text-3xl font-semibold tracking-tight">{props.value}</p>
      </div>
      <p className={`mt-3 text-sm ${isWholeTileClickable ? "text-current/90" : "opacity-85"}`}>
        {props.detail}
        {isWholeTileClickable && <span className="ml-1 opacity-60">→</span>}
      </p>
    </>
  );

  if (isWholeTileClickable) {
    return (
      <Link 
        href={props.actionHref!}
        className={`block rounded-xl border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.15)] ${baseClasses} ${interactionClasses}`}
        data-testid={props.testId}
      >
        {content}
      </Link>
    );
  }

  return (
    <section
      className={`rounded-xl border p-4 shadow-[0_8px_24px_rgba(15,23,42,0.15)] ${baseClasses}`}
      data-testid={props.testId}
    >
      {content}
    </section>
  );
}
