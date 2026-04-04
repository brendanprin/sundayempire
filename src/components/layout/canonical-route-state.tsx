"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { BrandMascot } from "@/components/brand";

type CanonicalRouteStateTone = "loading" | "error" | "empty";

function toneClasses(tone: CanonicalRouteStateTone) {
  if (tone === "error") {
    return "border-red-700/50 bg-red-950/30 text-red-100";
  }

  if (tone === "empty") {
    return "text-amber-100";
  }

  return "text-slate-300";
}

function toneSurfaceStyles(tone: CanonicalRouteStateTone) {
  if (tone === "error") {
    return {
      border: "1px solid rgba(185, 28, 28, 0.5)",
      backgroundColor: "rgba(69, 10, 10, 0.3)",
    };
  }

  if (tone === "empty") {
    return {
      border: "1px solid var(--brand-structure-muted)",
      backgroundColor: "var(--brand-surface-card)",
    };
  }

  return {
    border: "1px solid var(--brand-structure-muted)",
    backgroundColor: "var(--brand-surface-muted)",
  };
}

function compactToneClasses(tone: Exclude<CanonicalRouteStateTone, "loading">) {
  if (tone === "error") {
    return "text-red-100";
  }

  return "text-slate-300";
}

function compactToneSurfaceStyles(tone: Exclude<CanonicalRouteStateTone, "loading">) {
  if (tone === "error") {
    return {
      border: "1px solid rgba(185, 28, 28, 0.4)",
      backgroundColor: "rgba(69, 10, 10, 0.2)",
    };
  }

  return {
    border: "1px solid var(--brand-structure-muted)",
    backgroundColor: "var(--brand-surface-card)",
  };
}

export function CompactEmptyState(props: {
  message: string;
  tone?: "empty" | "error";
  actionHref?: string;
  actionLabel?: string;
  testId?: string;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2.5 text-sm ${compactToneClasses(props.tone ?? "empty")}`}
      style={compactToneSurfaceStyles(props.tone ?? "empty")}
      data-testid={props.testId}
      role={props.tone === "error" ? "alert" : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{props.message}</p>
        {props.actionHref && props.actionLabel ? (
          <Link
            href={props.actionHref}
            className="inline-flex rounded-md px-2.5 py-1 text-xs font-medium transition"
            style={{
              border: "1px solid rgba(255, 255, 255, 0.25)",
              color: "var(--foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {props.actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function CanonicalRouteState(props: {
  eyebrow: string;
  title: string;
  description: string;
  tone: CanonicalRouteStateTone;
  message: string;
  safetyCopy?: string;
  actionHref?: string;
  actionLabel?: string;
  onRetry?: () => void;
  testId?: string;
  headingLevel?: "h1" | "h2";
  children?: ReactNode;
}) {
  return (
    <div className="space-y-6" data-testid={props.testId}>
      <PageHeaderBand
        eyebrow={props.eyebrow}
        title={props.title}
        description={props.description}
        headingLevel={props.headingLevel}
      />

      <section
        className={`rounded-xl px-4 py-4 ${toneClasses(props.tone)}`}
        style={toneSurfaceStyles(props.tone)}
        data-testid={props.testId ? `${props.testId}-message` : undefined}
        role={props.tone === "error" ? "alert" : undefined}
        aria-live={props.tone === "error" ? "assertive" : "polite"}
      >
        {props.tone === "empty" ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <BrandMascot variant="default" size="md" context="empty-state" />
            <div className="text-center">
              <p className="text-sm font-medium">{props.message}</p>
              {props.safetyCopy ? <p className="mt-2 text-sm opacity-90">{props.safetyCopy}</p> : null}
            </div>
            {props.actionHref && props.actionLabel ? (
              <Link
                href={props.actionHref}
                className="mt-2 inline-flex rounded-lg px-3 py-2 text-sm font-medium transition"
                style={{
                  border: "1px solid var(--brand-structure-muted)",
                  backgroundColor: "var(--brand-surface-elevated)",
                  color: "var(--foreground)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--brand-accent-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--brand-surface-elevated)";
                }}
              >
                {props.actionLabel}
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm font-medium">{props.message}</p>
            {props.safetyCopy ? <p className="mt-2 text-sm opacity-90">{props.safetyCopy}</p> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {props.onRetry ? (
                <button
                  type="button"
                  onClick={props.onRetry}
                  className="inline-flex rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-current/50"
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    color: "var(--foreground)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  Try again
                </button>
              ) : null}
              {props.actionHref && props.actionLabel ? (
                <Link
                  href={props.actionHref}
                  className="inline-flex rounded-lg px-3 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-current/50"
                  style={{
                    border: "1px solid rgba(255, 255, 255, 0.3)",
                    color: "var(--foreground)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  {props.actionLabel}
                </Link>
              ) : null}
            </div>
          </>
        )}

      </section>

      {props.tone === "loading" ? (
        <div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-hidden="true"
          data-testid={props.testId ? `${props.testId}-skeleton` : undefined}
          aria-label="Loading content"
        >
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl"
              style={{
                border: "1px solid var(--brand-structure-muted)",
                backgroundColor: "var(--brand-surface-muted)",
              }}
            />
          ))}
        </div>
      ) : null}

      {props.children}
    </div>
  );
}
