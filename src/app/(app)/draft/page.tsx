"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { DraftHomeView } from "@/components/draft/draft-home-view";
import { CompatibilityNotice } from "@/components/layout/compatibility-notice";
import { requestJson } from "@/lib/client-request";
import type { DraftHomeProjection } from "@/types/draft";

function DraftLauncherPageContent() {
  const searchParams = useSearchParams();
  const [draftHome, setDraftHome] = useState<DraftHomeProjection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startupRetired = searchParams.get("startup") === "retired";
  const retiredSessionId = searchParams.get("session")?.trim() ?? "";

  useEffect(() => {
    let mounted = true;

    requestJson<DraftHomeProjection>("/api/drafts/home", undefined, "Failed to load draft home.")
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setDraftHome(payload);
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Failed to load draft home.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (error && !draftHome) {
    return (
      <div className="space-y-6">
        <PageHeaderBand
          eyebrow="SundayEmpire"
          title="Picks & Draft"
          description="Move between rookie draft setup, veteran auction operations, and pick ownership from one draft workspace."
          titleTestId="draft-title"
          eyebrowTestId="draft-eyebrow"
        />
        <div 
          className="rounded-lg px-4 py-3 text-sm text-red-200"
          style={{
            border: "1px solid rgba(185, 28, 28, 0.5)",
            backgroundColor: "rgba(69, 10, 10, 0.3)",
          }}
        >
          Picks & Draft could not load. {error} Existing draft, auction, and pick records are unchanged. 
          Refresh to retry, or return from the dashboard.
        </div>
      </div>
    );
  }

  if (!draftHome) {
    return (
      <div className="space-y-6">
        <PageHeaderBand
          eyebrow="SundayEmpire"
          title="Picks & Draft"
          description="Move between rookie draft setup, veteran auction operations, and pick ownership from one draft workspace."
          titleTestId="draft-title"
          eyebrowTestId="draft-eyebrow"
        />
        <div 
          className="rounded-lg px-4 py-3 text-sm"
          style={{
            border: "1px solid var(--brand-structure-muted)",
            backgroundColor: "var(--brand-surface-card)",
            color: "var(--muted-foreground)",
          }}
        >
          Loading picks, rookie draft status, and veteran auction status. 
          Existing draft and auction records stay unchanged while the draft home loads.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeaderBand
        eyebrow="SundayEmpire"
        title="Draft Operations"
        description="Move between rookie draft setup, veteran auction operations, and pick ownership from one draft workspace."
        titleTestId="draft-title"
        eyebrowTestId="draft-eyebrow"
      />
      
      {startupRetired ? (
        <CompatibilityNotice
          eyebrow="Retired compatibility route"
          title="Startup Draft retired"
          description={
            retiredSessionId
              ? `Startup session ${retiredSessionId} remains on record, but startup draft execution no longer uses a supported standalone workspace. Use Picks & Draft for supported rookie and veteran draft flows.`
              : "Startup draft execution no longer uses a supported standalone workspace. Use Picks & Draft for supported rookie and veteran draft flows."
          }
          links={[
            { href: "/draft/rookie", label: "Open Rookie Draft" },
            { href: "/draft/veteran-auction", label: "Open Veteran Auction" },
            { href: "/settings", label: "View retained routes" },
          ]}
          tone="warning"
          testId="startup-draft-retired-notice"
        />
      ) : null}

      <DraftHomeView draftHome={draftHome} />
    </div>
  );
}

export default function DraftLauncherPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <PageHeaderBand
            eyebrow="SundayEmpire"
            title="Picks & Draft"
            description="Move between rookie draft setup, veteran auction operations, and pick ownership from one draft workspace."
            titleTestId="draft-title"
            eyebrowTestId="draft-eyebrow"
          />
          <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 py-3 text-sm text-slate-300">
            Loading picks, rookie draft status, and veteran auction status. 
            Existing draft and auction records stay unchanged while the draft home loads.
          </div>
        </div>
      }
    >
      <DraftLauncherPageContent />
    </Suspense>
  );
}
