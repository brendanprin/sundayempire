"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DashboardRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new My Leagues account-level page
    router.replace("/my-leagues");
  }, [router]);

  return (
    <div className="space-y-6" data-testid="dashboard-redirect-page">
      <header className="space-y-1">
        <p
          className="text-xs uppercase tracking-[0.2em]"
          style={{ color: "var(--muted-foreground)" }}
        >
          SundayEmpire
        </p>
        <h2
          className="text-2xl font-semibold"
          style={{ color: "var(--foreground)" }}
        >
          Redirecting to Account Hub
        </h2>
        <p
          className="text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          Taking you to your dynasty football account page...
        </p>
      </header>

      <div
        className="rounded-lg p-6 text-sm"
        style={{
          border: "1px solid var(--brand-structure-muted)",
          backgroundColor: "var(--brand-surface-card)",
          color: "var(--muted-foreground)",
        }}
      >
        Redirecting to your dynasty football account hub...
      </div>
    </div>
  );
}
