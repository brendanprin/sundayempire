import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { DashboardChangeFeed, type DashboardChangeFeedItem } from "@/components/dashboard/dashboard-change-feed";
import type { LeagueSetupChecklistProjection } from "@/lib/read-models/dashboard/types";

export type DashboardActionItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  eyebrow?: string;
  meta?: string;
  badge?: string;
  tone?: "default" | "warning" | "critical" | "accent";
  testId?: string;
  linkTestId?: string;
  mobileTestId?: string;
};

export type DashboardDeadlineCardItem = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  badge: string;
  tone?: "default" | "warning" | "critical" | "accent";
};

function badgeClasses(tone: DashboardActionItem["tone"]) {
  if (tone === "critical") {
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] text-[var(--status-critical-text)] shadow-[0_0_0_2px_var(--status-critical-ring)] font-semibold";
  }

  if (tone === "warning") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] shadow-[0_0_0_1px_var(--status-warning-ring)]";
  }

  if (tone === "accent") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] text-[var(--status-info-text)] shadow-[0_0_0_1px_var(--status-info-ring)]";
  }

  return "border-[var(--status-neutral-border)] bg-[var(--status-neutral-bg)] text-[var(--status-neutral-text)]";
}

function cardClasses(tone: DashboardActionItem["tone"]) {
  if (tone === "critical") {
    return "border-[var(--status-critical-border)] bg-[var(--status-critical-bg)] shadow-[0_0_0_2px_var(--status-critical-ring)]";
  }

  if (tone === "warning") {
    return "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] shadow-[0_0_0_1px_var(--status-warning-ring)]";
  }

  if (tone === "accent") {
    return "border-[var(--status-info-border)] bg-[var(--status-info-bg)] shadow-[0_0_0_1px_var(--status-info-ring)]";
  }

  return "border-slate-800 bg-slate-900/70";
}

export function DashboardActionCenter(props: {
  actions: DashboardActionItem[];
  deadlines: DashboardDeadlineCardItem[];
  changeItems: DashboardChangeFeedItem[];
  setupChecklist?: LeagueSetupChecklistProjection | null;
  actionQueueTestId?: string;
  onActionSelect: (actionId: string, source: "action-center" | "mobile-rail") => void;
}) {
  const primaryAction = props.actions[0] ?? null;
  const remainingActions = props.actions.slice(1);
  const mobileActions = props.actions.slice(0, 3);

  return (
    <section className="space-y-4" data-testid="dashboard-priority-zone">
      <div className="max-w-3xl">
        <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500" data-testid="dashboard-action-center-label">
          Action Center
        </p>
        <h2 className="mt-2 text-3xl font-bold text-slate-100">What needs attention now</h2>
        <p className="mt-3 text-base text-slate-300">
          Start with the highest-pressure workflow, scan what changed, and move into the next canonical screen without hunting through utility pages.
        </p>
      </div>

      {props.setupChecklist?.available ? (
        <DashboardCard
          title="New League Checklist"
          eyebrow="Setup Progress"
          description="Commissioner-first setup items with explicit completion state and a single next action."
          className="border-amber-700/40 bg-[linear-gradient(160deg,rgba(120,53,15,0.2),rgba(15,23,42,0.94)_40%,rgba(2,6,23,0.96))] shadow-[0_18px_48px_rgba(120,53,15,0.2)]"
          testId="dashboard-setup-checklist"
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                className="text-xs text-amber-100/90"
                data-testid="dashboard-setup-checklist-progress"
              >
                {props.setupChecklist.completedItemCount} / {props.setupChecklist.totalItemCount} complete
              </p>
              <span className="rounded-full border border-amber-600/60 bg-amber-950/40 px-2.5 py-1 text-[11px] font-medium text-amber-100">
                {props.setupChecklist.completionPercent}% complete
              </span>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {props.setupChecklist.items.map((item) => {
                const itemTone =
                  item.status === "COMPLETE"
                    ? "border-emerald-700/40 bg-emerald-950/20 text-emerald-100"
                    : item.status === "INCOMPLETE_POSTPONED"
                      ? "border-amber-700/40 bg-amber-950/20 text-amber-100"
                      : "border-slate-700/50 bg-slate-900/60 text-slate-100";
                const statusLabel =
                  item.status === "COMPLETE"
                    ? "Complete"
                    : item.status === "INCOMPLETE_POSTPONED"
                      ? "Postponed"
                      : "Incomplete";

                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border px-3 py-3 text-sm ${itemTone}`}
                    data-testid={`dashboard-setup-checklist-item-${item.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{item.title}</p>
                      <span
                        className="rounded-full border border-current/40 px-2 py-0.5 text-[11px] uppercase tracking-wide"
                        data-testid={`dashboard-setup-checklist-status-${item.id}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p className="mt-2 text-xs opacity-90">{item.description}</p>
                    {item.href && item.ctaLabel ? (
                      <Link
                        href={item.href}
                        className="mt-3 inline-flex rounded-md border border-current/50 px-2.5 py-1.5 text-xs font-medium transition hover:border-current"
                        data-testid={`dashboard-setup-checklist-link-${item.id}`}
                        onClick={() => props.onActionSelect(`setup-${item.id}`, "action-center")}
                      >
                        {item.ctaLabel}
                      </Link>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </div>
        </DashboardCard>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.95fr)]" data-testid="dashboard-priority-cards">
        <DashboardCard
          title="Action Inbox"
          eyebrow="Next Up"
          description="The next best moves for this workspace, ranked ahead of neutral status reads."
          className="border-sky-600/60 bg-[linear-gradient(160deg,rgba(8,47,73,0.35),rgba(15,23,42,0.92)_35%,rgba(2,6,23,0.96))] shadow-[0_0_40px_rgba(14,165,233,0.15),0_20px_60px_rgba(15,23,42,0.4)] ring-1 ring-sky-500/20"
          testId={props.actionQueueTestId}
        >
          {primaryAction ? (
            <div className="space-y-4">
              <article className={`rounded-2xl border p-4 ${cardClasses(primaryAction.tone ?? "accent")}`} data-testid={primaryAction.testId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      {primaryAction.eyebrow ?? "Start Here"}
                    </p>
                    <h3 className="text-xl font-semibold text-slate-100">{primaryAction.title}</h3>
                    <p className="max-w-2xl text-sm text-slate-300">{primaryAction.description}</p>
                  </div>
                  {primaryAction.badge ? (
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${badgeClasses(primaryAction.tone)}`}>
                      {primaryAction.badge}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">{primaryAction.meta ?? "Open the canonical workflow for the full detail."}</p>
                  <Link
                    href={primaryAction.href}
                    className="rounded-lg border border-slate-600 bg-slate-950/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-400"
                    data-testid={primaryAction.linkTestId}
                    onClick={() => props.onActionSelect(primaryAction.id, "action-center")}
                  >
                    {primaryAction.ctaLabel}
                  </Link>
                </div>
              </article>

              {remainingActions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {remainingActions.map((action) => (
                    <article
                      key={action.id}
                      className={`rounded-xl border p-4 ${cardClasses(action.tone ?? "default")}`}
                      data-testid={action.testId}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{action.title}</p>
                          <p className="mt-2 text-sm text-slate-300">{action.description}</p>
                        </div>
                        {action.badge ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeClasses(action.tone)}`}>
                            {action.badge}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">{action.meta ?? "Continue in the canonical workflow."}</p>
                        <Link
                          href={action.href}
                          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-slate-500"
                          data-testid={action.linkTestId}
                          onClick={() => props.onActionSelect(action.id, "action-center")}
                        >
                          {action.ctaLabel}
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {mobileActions.length > 0 ? (
                <nav
                  className="flex gap-2 overflow-x-auto pb-1 md:hidden"
                  aria-label="Mobile action shortcuts"
                  data-testid="dashboard-mobile-action-rail"
                >
                  {mobileActions.map((action) => (
                    <Link
                      key={action.id}
                      href={action.href}
                      className={`min-w-[15rem] rounded-xl border px-4 py-3 text-sm font-medium ${cardClasses(action.tone ?? "default")}`}
                      data-testid={action.mobileTestId}
                      onClick={() => props.onActionSelect(action.id, "mobile-rail")}
                    >
                      <span className="block text-[11px] uppercase tracking-[0.2em] text-slate-500">
                        {action.eyebrow ?? "Quick Action"}
                      </span>
                      <span className="mt-2 block text-base text-slate-100">{action.title}</span>
                      <span className="mt-1 block text-xs text-slate-400">{action.ctaLabel}</span>
                    </Link>
                  ))}
                </nav>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No action recommendations are available yet. Open Rules & Deadlines or League Activity to confirm the current state.
            </p>
          )}
        </DashboardCard>

        <div className="space-y-4">
          <DashboardCard
            title="Upcoming Deadlines"
            eyebrow="Rules & Deadlines"
            description="Current-phase and next-up deadlines backed by lifecycle records."
            className="border-slate-700/40 bg-slate-900/40"
            action={
              <Link
                href="/rules"
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-200"
                onClick={() => props.onActionSelect("rules-deadlines", "action-center")}
              >
                Open Rules & Deadlines
              </Link>
            }
            testId="deadline-summary-card"
          >
            {props.deadlines.length > 0 ? (
              <div className="space-y-3">
                {props.deadlines.map((deadline) => (
                  <article
                    key={deadline.id}
                    className={`rounded-xl border p-3 ${cardClasses(deadline.tone ?? "default")}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-100">{deadline.title}</p>
                        <p className="mt-1 text-xs text-slate-400">{deadline.subtitle}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeClasses(deadline.tone)}`}>
                        {deadline.badge}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{deadline.detail}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No deadlines are scheduled for the active season yet.</p>
            )}
          </DashboardCard>

          <DashboardChangeFeed 
            items={props.changeItems} 
            testId="dashboard-whats-changed" 
            className="border-slate-700/40 bg-slate-900/40"
          />
        </div>
      </div>
    </section>
  );
}
