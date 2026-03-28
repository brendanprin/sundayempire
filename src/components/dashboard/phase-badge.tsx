type PhaseTone = "neutral" | "info" | "warning" | "critical";

function toneClasses(tone: PhaseTone) {
  if (tone === "critical") {
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)] shadow-[0_0_0_2px_var(--status-critical-ring)] font-semibold";
  }

  if (tone === "warning") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] shadow-[0_0_0_1px_var(--status-warning-ring)] font-medium";
  }

  if (tone === "info") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[0_0_0_1px_var(--status-info-ring)]";
  }

  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]";
}

export function PhaseBadge(props: {
  label: string;
  tone?: PhaseTone;
  testId?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${toneClasses(props.tone ?? "neutral")}`}
      data-testid={props.testId}
    >
      {props.label}
    </span>
  );
}
