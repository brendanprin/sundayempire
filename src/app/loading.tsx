"use client";

import { BrandMascot } from "@/components/brand";

export default function LoadingPage() {
  return (
    <main 
      className="mx-auto flex min-h-screen max-w-4xl items-center px-4 py-10"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div className="w-full space-y-8">
        <div className="flex items-center justify-center gap-4">
          <BrandMascot variant="default" size="md" context="illustration" />
          <div>
            <h1 
              className="text-xl font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              Loading SundayEmpire
            </h1>
            <p 
              className="mt-1 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              Preparing your dynasty workspace...
            </p>
          </div>
        </div>

        <div 
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-hidden="true"
          aria-label="Loading content"
        >
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl"
              style={{
                border: "1px solid var(--brand-structure-muted)",
                backgroundColor: "var(--brand-surface-muted)",
                animationDelay: `${index * 0.1}s`,
              }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}