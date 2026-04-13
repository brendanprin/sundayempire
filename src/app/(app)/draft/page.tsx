"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { CompactEmptyState } from "@/components/layout/canonical-route-state";
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

  const draftHeaderBand = (
    <PageHeaderBand
      eyebrow="SundayEmpire"
      title="Draft Operations"
      description="Move between rookie draft setup, veteran auction operations, and pick ownership from one draft workspace."
      titleTestId="draft-title"
      eyebrowTestId="draft-eyebrow"
    />
  );

  if (error && !draftHome) {
    return (
      <div className="space-y-6">
        {draftHeaderBand}
        <CompactEmptyState
          message={`Draft Operations could not load. ${error} Existing draft, auction, and pick records are unchanged. Refresh to retry.`}
          tone="error"
          testId="draft-error-state"
        />
      </div>
    );
  }

  if (!draftHome) {
    return (
      <div className="space-y-6">
        {draftHeaderBand}
        <CompactEmptyState
          message="Loading picks, rookie draft status, and veteran auction status..."
          testId="draft-loading-state"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {draftHeaderBand}

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
            title="Draft Operations"
            description="Move between rookie draft setup, veteran auction operations, and pick ownership from one draft workspace."
            titleTestId="draft-title"
            eyebrowTestId="draft-eyebrow"
          />
          <CompactEmptyState
            message="Loading picks, rookie draft status, and veteran auction status..."
            testId="draft-suspense-state"
          />
        </div>
      }
    >
      <DraftLauncherPageContent />
    </Suspense>
  );
}
