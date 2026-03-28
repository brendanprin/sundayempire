"use client";

import Link from "next/link";
import { BrandMascot } from "@/components/brand";

export default function NotFoundPage() {
  return (
    <main 
      className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div 
        className="w-full space-y-6 rounded-xl p-8 text-center shadow-[0_18px_60px_rgba(15,23,42,0.25)]"
        style={{
          border: "1px solid var(--brand-structure-muted)",
          backgroundColor: "var(--brand-surface-elevated)",
        }}
      >
        <div className="flex justify-center">
          <BrandMascot variant="default" size="lg" context="support" />
        </div>
        
        <div>
          <h1 
            className="text-2xl font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            Page Not Found
          </h1>
          <p 
            className="mt-3 text-lg"
            style={{ color: "var(--muted-foreground)" }}
          >
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg px-4 py-2 font-medium transition"
            style={{
              backgroundColor: "var(--brand-accent-primary)",
              color: "var(--brand-midnight-navy)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--brand-accent-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--brand-accent-primary)";
            }}
          >
            Return to Dashboard
          </Link>
          <Link
            href="/trades"
            className="rounded-lg px-4 py-2 font-medium transition"
            style={{
              border: "1px solid var(--brand-structure-muted)",
              backgroundColor: "var(--brand-surface-card)",
              color: "var(--foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--brand-surface-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--brand-surface-card)";
            }}
          >
            Browse Trades
          </Link>
        </div>
      </div>
    </main>
  );
}