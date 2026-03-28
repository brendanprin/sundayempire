import { DashboardSummaryTile } from "@/components/dashboard/dashboard-summary-tile";

export type DashboardHealthSummaryItem = {
  id: string;
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
  tone?: "default" | "warning" | "critical" | "accent";
  actionHref?: string;
  actionLabel?: string;
  testId?: string;
};

export function DashboardHealthSummaryRow(props: {
  items: DashboardHealthSummaryItem[];
  testId?: string;
}) {
  return (
    <section className="space-y-3" data-testid={props.testId}>
      <div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-600">Health Summary</p>
        <h2 className="mt-1 text-lg font-medium text-slate-200">Team and league posture</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {props.items.map((item) => (
          <DashboardSummaryTile
            key={item.id}
            eyebrow={item.eyebrow}
            title={item.title}
            value={item.value}
            detail={item.detail}
            tone={item.tone}
            actionHref={item.actionHref}
            actionLabel={item.actionLabel}
            testId={item.testId}
          />
        ))}
      </div>
    </section>
  );
}
