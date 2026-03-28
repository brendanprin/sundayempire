import { ReactNode } from "react";

export function DashboardCard(props: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <section
      className={`rounded-xl p-4 shadow-[0_18px_60px_rgba(15,23,42,0.25)] ${props.className ?? ""}`.trim()}
      style={{
        border: "1px solid var(--brand-structure-muted)",
        backgroundColor: "var(--brand-surface-elevated)",
      }}
      data-testid={props.testId}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {props.eyebrow ? (
            <p 
              className="text-[11px] uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              {props.eyebrow}
            </p>
          ) : null}
          <h3 
            className="mt-1 text-base font-semibold"
            style={{ color: "var(--foreground)" }}
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
