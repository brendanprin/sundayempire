import { ReactNode } from "react";

export function DashboardCard(props: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
  id?: string;
  tier?: 1 | 2 | 3;
}) {
  const border =
    props.tier === 1
      ? "1px solid rgba(217, 119, 6, 0.45)"
      : "1px solid var(--brand-structure-muted)";
  const boxShadow =
    props.tier === 1
      ? "0 18px 60px rgba(15,23,42,0.25), 0 0 40px rgba(217, 119, 6, 0.07)"
      : "0 18px 60px rgba(15,23,42,0.25)";
  const eyebrowColor =
    props.tier === 1 ? "rgb(251, 191, 36)" : "var(--muted-foreground)";
  const titleColor =
    props.tier === 3 ? "var(--muted-foreground)" : "var(--foreground)";

  return (
    <section
      id={props.id}
      className={`scroll-mt-6 rounded-xl p-4 ${props.tier === 3 ? "opacity-70" : ""} ${props.className ?? ""}`.trim()}
      style={{ border, backgroundColor: "var(--brand-surface-elevated)", boxShadow }}
      data-testid={props.testId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {props.eyebrow ? (
            <p
              className="text-[11px] uppercase tracking-[0.2em]"
              style={{ color: eyebrowColor }}
            >
              {props.eyebrow}
            </p>
          ) : null}
          <h3
            className="mt-1 text-base font-semibold"
            style={{ color: titleColor }}
          >
            {props.title}
          </h3>
          {props.description ? (
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {props.description}
            </p>
          ) : null}
        </div>
        {props.action}
      </div>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}
