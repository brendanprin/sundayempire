import { DashboardCard } from "@/components/dashboard/dashboard-card";

export type DashboardChangeFeedItem = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  timestamp: string;
  tone?: "default" | "warning" | "critical" | "accent";
};

function toneClasses(tone: DashboardChangeFeedItem["tone"]) {
  if (tone === "critical") {
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)] shadow-[0_0_0_1px_var(--status-critical-ring)]";
  }

  if (tone === "warning") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] shadow-[0_0_0_1px_var(--status-warning-ring)]";
  }

  if (tone === "accent") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)]";
  }

  return "border-slate-800 bg-slate-900/70 text-slate-100";
}

export function DashboardChangeFeed(props: {
  items: DashboardChangeFeedItem[];
  testId?: string;
  className?: string;
}) {
  return (
    <DashboardCard
      title="What Changed"
      eyebrow="Recent Signals"
      description="Unread updates in this app plus the latest league movement."
      className={props.className}
      testId={props.testId}
    >
      {props.items.length > 0 ? (
        <div className="space-y-3">
          {props.items.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border p-3 ${toneClasses(item.tone ?? "default")}`}
            >
              <p className="text-[11px] uppercase tracking-[0.2em] opacity-75">{item.eyebrow}</p>
              <p className="mt-2 text-sm font-medium">{item.title}</p>
              <p className="mt-1 text-xs opacity-90">{item.description}</p>
              <p className="mt-2 text-[11px] opacity-70">{item.timestamp}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-100 font-medium">No recent activity yet</p>
          <p className="text-sm text-slate-400">
            As teams are added and members join, league activity will appear here. Transactions, trades, and other events will be tracked automatically.
          </p>
        </div>
      )}
    </DashboardCard>
  );
}
