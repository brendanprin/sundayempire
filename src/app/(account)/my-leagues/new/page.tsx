"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/client-request";

type CreateLeagueWizardStep = "basics";

type CreateLeaguePayload = {
  name: string;
  description?: string;
  seasonYear: string;
  designatedCommissionerEmail?: string;
};

export default function CreateLeaguePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<CreateLeagueWizardStep>("basics");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seasonYear, setSeasonYear] = useState(String(new Date().getFullYear()));
  const [designatedCommissionerEmail, setDesignatedCommissionerEmail] = useState("");
  
  const nameInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setCreating(true);

    try {
      const payload: CreateLeaguePayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        seasonYear,
        designatedCommissionerEmail: designatedCommissionerEmail.trim() || undefined,
      };

      const response = await requestJson<{ leagueId: string }>("/api/leagues", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Activate the new league and navigate to it
      await requestJson("/api/auth/entry-resolver", {
        method: "POST",
        body: JSON.stringify({ leagueId: response.leagueId }),
      });

      router.push("/dashboard");
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : "Failed to create league.",
      );
      setCreating(false);
    }
  }

  function handleCancel() {
    router.push("/my-leagues");
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }}>
      {/* Progress indicator */}
      <div className="border-b" style={{ borderColor: "var(--brand-structure-muted)" }}>
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/my-leagues"
              className="text-sm font-medium transition-colors hover:text-[var(--brand-accent-primary)]"
              style={{ color: "var(--muted-foreground)" }}
            >
              ← My Leagues
            </Link>
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              /
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              Create New League
            </span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4" style={{ color: "var(--foreground)" }}>
            Create New League
          </h1>
          <p className="text-lg" style={{ color: "var(--muted-foreground)" }}>
            Set up your dynasty football league to get started with player management, 
            drafts, and season tracking.
          </p>
        </div>

        <form 
          onSubmit={handleSubmit}
          className="rounded-xl border p-8"
          style={{
            borderColor: "var(--brand-structure-muted)",
            backgroundColor: "var(--brand-surface-elevated)",
          }}
        >
          {error && (
            <div
              className="mb-6 rounded-md border border-red-700/70 bg-red-950/40 px-4 py-3 text-sm text-red-100"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div>
              <label 
                htmlFor="league-name"
                className="block text-sm font-semibold mb-2" 
                style={{ color: "var(--foreground)" }}
              >
                League Name <span className="text-red-400">*</span>
              </label>
              <input
                ref={nameInputRef}
                id="league-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-4 py-3 text-base transition-colors focus:ring-2 focus:ring-[var(--brand-accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                style={{
                  borderColor: "var(--brand-structure-muted)",
                  color: "var(--foreground)",
                }}
                placeholder="Sunday Empire League"
                autoFocus
                required
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                Choose a memorable name that reflects your league's personality.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label 
                  htmlFor="season-year"
                  className="block text-sm font-semibold mb-2" 
                  style={{ color: "var(--foreground)" }}
                >
                  Season Year <span className="text-red-400">*</span>
                </label>
                <input
                  id="season-year"
                  type="number"
                  value={seasonYear}
                  onChange={(event) => setSeasonYear(event.target.value)}
                  className="w-full rounded-lg border bg-transparent px-4 py-3 text-base transition-colors focus:ring-2 focus:ring-[var(--brand-accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  min={new Date().getFullYear()}
                  max={new Date().getFullYear() + 5}
                  required
                />
              </div>

              <div>
                <label 
                  htmlFor="commissioner-email"
                  className="block text-sm font-semibold mb-2" 
                  style={{ color: "var(--foreground)" }}
                >
                  Commissioner Email
                </label>
                <input
                  id="commissioner-email"
                  type="email"
                  value={designatedCommissionerEmail}
                  onChange={(event) => setDesignatedCommissionerEmail(event.target.value)}
                  className="w-full rounded-lg border bg-transparent px-4 py-3 text-base transition-colors focus:ring-2 focus:ring-[var(--brand-accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  placeholder="commissioner@example.com"
                />
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Optional. Leave blank to make yourself commissioner.
                </p>
              </div>
            </div>

            <div>
              <label 
                htmlFor="description"
                className="block text-sm font-semibold mb-2" 
                style={{ color: "var(--foreground)" }}
              >
                League Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="w-full rounded-lg border bg-transparent px-4 py-3 text-base transition-colors focus:ring-2 focus:ring-[var(--brand-accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--background)]"
                style={{
                  borderColor: "var(--brand-structure-muted)",
                  color: "var(--foreground)",
                }}
                placeholder="Optional description of your league's rules, history, or culture..."
                rows={3}
              />
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                Help new members understand what makes your league special.
              </p>
            </div>
          </div>

          <div className="flex gap-4 items-center justify-end mt-8 pt-6 border-t" style={{ borderColor: "var(--brand-structure-muted)" }}>
            <button
              type="button"
              onClick={handleCancel}
              className="px-6 py-2.5 text-sm font-medium transition-colors rounded-lg hover:bg-[var(--brand-structure-muted)]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-[var(--brand-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating League..." : "Create League"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}