import Link from "next/link";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { CommissionerGovernancePanel } from "@/components/settings/commissioner-governance-panel";
import { PlatformInvitePanel } from "@/components/settings/platform-invite-panel";
import { getAuthenticatedUser } from "@/lib/auth";

type PrimaryLink = {
  href: string;
  label: string;
  description: string;
};

type CompatibilityRoute = {
  id: string;
  href: string;
  label: string;
  disposition: "Alias" | "Shim" | "Deprecated";
  description: string;
  canonicalReplacement: string;
};

type CompatibilitySection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  routes: CompatibilityRoute[];
};

const PRIMARY_LINKS: PrimaryLink[] = [
  {
    href: "/",
    label: "League Directory",
    description: "Switch leagues or reopen a workspace from the canonical root entry.",
  },
  {
    href: "/teams",
    label: "Teams Directory",
    description: "Browse franchise-level reads outside the manager workspace.",
  },
  {
    href: "/players",
    label: "Players Directory",
    description: "Browse player and contract reads outside the manager workflow.",
  },
];

const COMPATIBILITY_SECTIONS: CompatibilitySection[] = [
  {
    id: "commissioner",
    eyebrow: "Commissioner compatibility",
    title: "Commissioner-only retained utility",
    description:
      "This route remains available for operator troubleshooting, but it is not the primary commissioner workflow surface.",
    routes: [
      {
        id: "diagnostics",
        href: "/diagnostics",
        label: "Diagnostics",
        disposition: "Deprecated",
        description: "Pilot diagnostics console retained for direct-link safety and existing commissioner checks.",
        canonicalReplacement: "Commissioner Operations, Sync Queue, and Commissioner Audit",
      },
    ],
  },
];

function badgeClassName(disposition: CompatibilityRoute["disposition"]) {
  if (disposition === "Alias") {
    return "border-sky-700/50 bg-sky-950/40 text-sky-200";
  }

  if (disposition === "Shim") {
    return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  }

  return "border-slate-700 bg-slate-900 text-slate-300";
}

export default async function SettingsPage() {
  const user = await getAuthenticatedUser();
  const isPlatformAdmin = user?.platformRole === "ADMIN";

  return (
    <div className="space-y-6" data-testid="settings-page">
      <PageHeaderBand
        eyebrow="Settings"
        title="Settings"
        description="Session controls now stay in the top bar. This screen keeps canonical browse surfaces easy to reach while quarantining retained compatibility routes instead of letting them blend into the main product flow."
        headingLevel="h2"
      />

      <CommissionerGovernancePanel />

      {isPlatformAdmin ? (
        <section
          className="rounded-2xl border border-fuchsia-800/40 bg-gradient-to-br from-fuchsia-950/20 to-slate-950/70 p-5 lg:p-6"
          data-testid="settings-admin-support-link-card"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-fuchsia-400/90">Platform Support</p>
          <h3 className="mt-2 text-xl font-semibold text-fuchsia-100">League Support Workspace</h3>
          <p className="mt-2 text-sm text-fuchsia-200/80">
            Commissioner integrity support operations have moved to a dedicated workspace with
            searchable league indexing and paginated triage.
          </p>
          <Link
            href="/support/commissioner"
            className="mt-3 inline-block rounded-md bg-fuchsia-300 px-4 py-2 text-sm font-medium text-fuchsia-950 transition hover:bg-fuchsia-200"
            data-testid="settings-admin-support-link"
          >
            Open Commissioner Support Workspace
          </Link>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-2xl border border-green-800/30 bg-gradient-to-br from-green-950/20 to-slate-950/70 p-5 lg:p-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-green-400/90">Primary Workspace</p>
            <h3 className="mt-2 text-xl font-semibold text-green-100">Canonical browse surfaces</h3>
            <p className="mt-2 text-sm text-green-200/80">
              Core league management and browsing functionality - the main product experience.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {PRIMARY_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl border border-green-800/40 bg-green-950/30 p-4 transition hover:border-green-600/60 hover:bg-green-950/50"
              >
                <p className="text-sm font-semibold text-green-100">{link.label}</p>
                <p className="mt-1 text-sm text-green-200/70">{link.description}</p>
              </Link>
            ))}
          </div>
        </div>

        <details
          className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5"
          data-testid="settings-compatibility-links"
        >
          <summary className="flex cursor-pointer select-none items-center justify-between [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber-500/80">Secondary Access</p>
              <h3 className="mt-1 text-xl font-semibold text-slate-100">Advanced</h3>
              <p className="mt-1 text-sm text-slate-400">
                Compatibility routes and deprecated utilities.
              </p>
            </div>
            <span className="ml-4 shrink-0 text-xs text-slate-500">Expand ›</span>
          </summary>

          <div className="mt-4 border-t border-slate-800 pt-4">
            <p className="text-sm text-slate-500" data-testid="settings-retired-prototype-note">
              Retired routes such as Contracts Utility, Pick Ownership Utility, Startup Draft, Planning,
              Collaboration, and Recaps are no longer listed here. Old bookmarks redirect to canonical replacements.
            </p>
            <div className="mt-4 space-y-4">
              {COMPATIBILITY_SECTIONS.map((section) => (
                <section
                  key={section.id}
                  className="rounded-xl border border-slate-800 bg-slate-900/50 p-4"
                  data-testid={`settings-compatibility-section-${section.id}`}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{section.eyebrow}</p>
                  <h4 className="mt-2 text-base font-semibold text-slate-100">{section.title}</h4>
                  <p className="mt-2 text-sm text-slate-400">{section.description}</p>

                  <ul className="mt-4 space-y-3">
                    {section.routes.map((route) => (
                      <li key={route.href}>
                        <Link
                          href={route.href}
                          className="block rounded-xl border border-slate-800 bg-slate-950/70 p-4 transition hover:border-slate-600"
                          data-testid={`settings-compatibility-link-${route.id}`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-100">{route.label}</p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] ${badgeClassName(route.disposition)}`}
                            >
                              {route.disposition}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-400">{route.description}</p>
                          <dl className="mt-3 space-y-1 text-xs text-slate-500">
                            <div>
                              <dt className="inline font-medium text-slate-300">Canonical replacement:</dt>{" "}
                              <dd className="inline">{route.canonicalReplacement}</dd>
                            </div>
                            <div>
                              <dt className="inline font-medium text-slate-300">Route:</dt>{" "}
                              <dd className="inline">{route.href}</dd>
                            </div>
                          </dl>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </details>
      </section>

      <PlatformInvitePanel />
    </div>
  );
}
