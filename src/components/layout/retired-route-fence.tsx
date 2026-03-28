"use client";

import Link from "next/link";
import { CanonicalRouteState } from "@/components/layout/canonical-route-state";

type RetiredRouteLink = {
  href: string;
  label: string;
  description: string;
};

export function RetiredRouteFence(props: {
  title: string;
  description: string;
  message: string;
  safetyCopy: string;
  testId: string;
  links: RetiredRouteLink[];
}) {
  return (
    <CanonicalRouteState
      eyebrow="Retired Route"
      title={props.title}
      description="This route has been retired. Use the supported canonical workflows below instead."
      tone="empty"
      message={props.message}
      safetyCopy={props.safetyCopy}
      actionHref="/settings"
      actionLabel="View All Settings"
      testId={props.testId}
    >
      <section
        className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5"
        data-testid={`${props.testId}-links`}
      >
        <p className="text-[11px] uppercase tracking-[0.2em] text-green-500/80">Active Workflows</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">Use these canonical routes instead</h2>
        <p className="mt-2 text-sm text-slate-400">
          These supported workflows provide the functionality you need.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {props.links.map((link) => (
            <Link
              key={`${link.href}-${link.label}`}
              href={link.href}
              className="rounded-xl border border-green-800/40 bg-green-950/20 p-4 transition hover:border-green-600/60 hover:bg-green-950/40"
            >
              <p className="text-sm font-semibold text-green-100">{link.label}</p>
              <p className="mt-2 text-sm text-green-200/70">{link.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </CanonicalRouteState>
  );
}
