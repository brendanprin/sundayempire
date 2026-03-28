"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CompatibilityNotice } from "@/components/layout/compatibility-notice";
import { requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import { trackUiEvent } from "@/lib/ui-analytics";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type AuthLeagueRole = "COMMISSIONER" | "MEMBER";

type AuthPayload = {
  user: {
    accountRole: "ADMIN" | "USER";
  };
  actor: {
    leagueRole: AuthLeagueRole;
  };
};

type DiagnosticsPayload = {
  checkedAt: string;
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
    phase: string;
  };
  service: {
    env: string;
    version: string;
  };
  summary: {
    pass: number;
    warn: number;
    fail: number;
  };
  queues: {
    pendingApprovals: number;
    pendingProcessing: number;
    queueBacklog: number;
  };
  subsystems: {
    id: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
    remediation: {
      label: string;
      href: string;
    };
    metrics?: Record<string, string | number | boolean | null>;
  }[];
};

function statusStyles(status: "pass" | "warn" | "fail") {
  if (status === "pass") {
    return "border-emerald-700/50 bg-emerald-950/40 text-emerald-200";
  }

  if (status === "warn") {
    return "border-amber-700/50 bg-amber-950/40 text-amber-200";
  }

  return "border-red-700/50 bg-red-950/40 text-red-200";
}

function toSupportStatus(status: "pass" | "warn" | "fail") {
  if (status === "pass") {
    return "HEALTHY";
  }

  return "UNHEALTHY";
}

export default function DiagnosticsPage() {
  const pathname = usePathname();
  const [actorRole, setActorRole] = useState<AuthLeagueRole | null>(null);
  const [accountRole, setAccountRole] = useState<"ADMIN" | "USER" | null>(null);
  const [payload, setPayload] = useState<DiagnosticsPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const diagnosticsLeagueId = payload?.league.id ?? null;
  const diagnosticsLeagueName = payload?.league.name ?? "";

  const loadDiagnostics = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await requestJson<DiagnosticsPayload>(
        "/api/commissioner/diagnostics",
        undefined,
        "Failed to load diagnostics.",
      );
      setPayload(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load diagnostics.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    requestJson<AuthPayload>("/api/auth/me")
      .then((auth) => {
        if (!mounted) return;

        setAccountRole(auth.user.accountRole);
        setActorRole(auth.actor.leagueRole);
        if (auth.actor.leagueRole !== "COMMISSIONER") {
          return;
        }

        loadDiagnostics().catch(() => {
          if (!mounted) return;
          setError("Failed to load diagnostics.");
        });
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to verify role access.");
      });

    return () => {
      mounted = false;
    };
  }, [loadDiagnostics]);

  if (actorRole && actorRole !== "COMMISSIONER") {
    return (
      <div className="space-y-4" data-testid="diagnostics-access-denied">
        <div>
          <h2 className="text-2xl font-semibold">Diagnostics Utility</h2>
          <p className="mt-1 text-sm text-slate-400">
            Retained commissioner troubleshooting surface kept outside the canonical operator flow.
          </p>
        </div>
        <CompatibilityNotice
          eyebrow="Deprecated commissioner utility"
          title="Diagnostics is compatibility-only."
          description="Use Commissioner Operations, Sync Queue, and Commissioner Audit for the normal governance workflow. This route remains available for direct links and deeper troubleshooting."
          links={[
            { href: "/commissioner", label: "Open Commissioner Operations" },
            { href: "/settings", label: "View route dispositions" },
          ]}
          testId="diagnostics-compatibility-notice"
        />
        <section className="rounded-lg border border-red-700/60 bg-red-950/30 p-4 text-sm text-red-100">
          <p className="font-medium">Only commissioners can view diagnostics.</p>
          <p className="mt-1 text-red-200/90">
            Return to the dashboard or contact the league commissioner for access.
          </p>
          <Link href="/" className="mt-3 inline-block text-sm text-sky-300 hover:text-sky-200">
            Open My Leagues
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="diagnostics-page">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Diagnostics Utility</h2>
          <p className="mt-1 text-sm text-slate-400">
            Retained commissioner troubleshooting checks for queue state, subsystem health, and direct-link support.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadDiagnostics().catch(() => setError("Failed to load diagnostics."))}
          disabled={busy || actorRole !== "COMMISSIONER"}
          className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-100 disabled:opacity-50"
        >
          {busy ? "Refreshing..." : "Refresh Checks"}
        </button>
      </div>

      <CompatibilityNotice
        eyebrow="Deprecated commissioner utility"
        title="This route is no longer part of the primary commissioner journey."
        description="Use Commissioner Operations for urgent governance work, Sync Queue for unresolved host mismatches, and Commissioner Audit for historical review. Diagnostics remains for advanced troubleshooting."
        links={[
          { href: "/commissioner", label: "Open Commissioner Operations" },
          { href: "/commissioner/audit", label: "Open Commissioner Audit" },
          { href: "/settings", label: "View route dispositions" },
        ]}
        testId="diagnostics-compatibility-notice"
      />

      {error ? (
        <div className="rounded-md border border-red-700 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div>
      ) : null}

      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-md border border-emerald-700/50 bg-emerald-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-emerald-200/80">Pass</p>
            <p className="mt-1 text-xl font-semibold text-emerald-100" data-testid="diagnostics-summary-pass">
              {payload?.summary.pass ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-amber-200/80">Warn</p>
            <p className="mt-1 text-xl font-semibold text-amber-100" data-testid="diagnostics-summary-warn">
              {payload?.summary.warn ?? 0}
            </p>
          </div>
          <div className="rounded-md border border-red-700/50 bg-red-950/30 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-red-200/80">Fail</p>
            <p className="mt-1 text-xl font-semibold text-red-100" data-testid="diagnostics-summary-fail">
              {payload?.summary.fail ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-300 md:grid-cols-3">
          <p>League: {payload?.league.name ?? "Loading..."}</p>
          <p>Season: {payload ? `${payload.season.year} · ${formatLeaguePhaseLabel(payload.season.phase)}` : "Loading..."}</p>
          <p>Checked: {payload ? new Date(payload.checkedAt).toLocaleString() : "Loading..."}</p>
          <p>Queue Backlog: {payload?.queues.queueBacklog ?? 0}</p>
          <p>Pending Review: {payload?.queues.pendingApprovals ?? 0}</p>
          <p>Pending Settlement: {payload?.queues.pendingProcessing ?? 0}</p>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Subsystem Checks</h3>
        {payload?.subsystems.map((subsystem) => (
          <article
            key={subsystem.id}
            className="rounded-lg border border-slate-800 bg-slate-950 p-4"
            data-testid="diagnostics-subsystem"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold">{subsystem.label}</p>
                <p className="mt-1 text-sm text-slate-300">{subsystem.detail}</p>
              </div>
              <span
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium uppercase ${statusStyles(subsystem.status)}`}
              >
                {subsystem.status}
              </span>
            </div>

            {subsystem.metrics ? (
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-400 md:grid-cols-3">
                {Object.entries(subsystem.metrics).map(([metric, value]) => (
                  <div key={`${subsystem.id}-${metric}`}>
                    <dt className="font-medium text-slate-300">{metric}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <Link
              href={subsystem.remediation.href}
              className="mt-3 inline-block text-xs text-sky-300 hover:text-sky-200"
              data-testid="diagnostics-remediation-link"
            >
              {subsystem.remediation.label}
            </Link>

            {accountRole === "ADMIN" &&
            diagnosticsLeagueId &&
            subsystem.id === "commissioner-integrity" ? (
              <Link
                href={`/support/commissioner?${new URLSearchParams({
                  leagueId: diagnosticsLeagueId,
                  q: diagnosticsLeagueName,
                  status: toSupportStatus(subsystem.status),
                  sort: "INTEGRITY_SEVERITY_DESC",
                  page: "1",
                  pageSize: "20",
                }).toString()}`}
                onClick={() => {
                  trackUiEvent({
                    eventType: PILOT_EVENT_TYPES.UI_SUPPORT_DEEP_LINK_OPENED_FROM_DIAGNOSTICS,
                    pagePath: pathname,
                    eventStep: "open_deep_link",
                    status: "success",
                    entityType: "league",
                    entityId: diagnosticsLeagueId,
                    context: {
                      subsystemId: subsystem.id,
                      subsystemStatus: subsystem.status,
                      supportStatus: toSupportStatus(subsystem.status),
                    },
                  });
                }}
                className="mt-2 inline-block text-xs text-cyan-300 hover:text-cyan-200"
                data-testid="diagnostics-support-link"
              >
                Open in Commissioner Support
              </Link>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
