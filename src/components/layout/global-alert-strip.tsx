import Link from "next/link";

type AlertTone = "normal" | "warning" | "critical";

export type GlobalAlertStripAlert = {
  id: string;
  title: string;
  description: string;
  level: AlertTone;
  href?: string | null;
};

export function GlobalAlertStrip(props: {
  alerts: GlobalAlertStripAlert[];
  testId?: string;
  itemTestIdPrefix?: string;
}) {
  if (props.alerts.length === 0) {
    return null;
  }

  const itemTestIdPrefix = props.itemTestIdPrefix ?? "global-alert";

  return (
    <div className="shell-alert-grid mt-5" data-testid={props.testId}>
      {props.alerts.map((alert) => (
        <div
          key={alert.id}
          className="shell-alert-card"
          data-testid={`${itemTestIdPrefix}-${alert.id}`}
          data-tone={alert.level}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="mt-1 text-xs opacity-90">{alert.description}</p>
            </div>
            {alert.href ? (
              <Link
                href={alert.href}
                className="rounded-lg border border-current/30 px-2.5 py-1 text-[11px] font-medium transition hover:bg-white/5"
              >
                Open workflow
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
