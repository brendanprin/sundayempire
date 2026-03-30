"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/client-request";

type CreateLeagueWizardStep = "basics" | "options" | "review";

type CreateLeaguePayload = {
  name: string;
  description?: string;
  seasonYear: number;
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

  // Validation helpers
  const isBasicsValid = () => {
    return name.trim().length >= 3 && 
           parseInt(seasonYear) >= new Date().getFullYear() && 
           parseInt(seasonYear) <= new Date().getFullYear() + 5;
  };

  const isOptionsValid = () => {
    // Email validation only if provided
    if (designatedCommissionerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(designatedCommissionerEmail.trim());
    }
    return true;
  };

  const getStepErrors = () => {
    const errors: string[] = [];
    
    if (step === "basics" || step === "review") {
      if (name.trim().length < 3) {
        errors.push("League name must be at least 3 characters");
      }
      
      const year = parseInt(seasonYear);
      const currentYear = new Date().getFullYear();
      if (year < currentYear || year > currentYear + 5) {
        errors.push(`Season year must be between ${currentYear} and ${currentYear + 5}`);
      }
    }
    
    if ((step === "options" || step === "review") && designatedCommissionerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(designatedCommissionerEmail.trim())) {
        errors.push("Please enter a valid email address");
      }
    }
    
    return errors;
  };

  const stepErrors = getStepErrors();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    
    if (step !== "review") return;
    if (stepErrors.length > 0) return;
    
    setError(null);
    setCreating(true);

    try {
      const payload: CreateLeaguePayload = {
        name: name.trim(),
        description: description.trim() || undefined,
        seasonYear: parseInt(seasonYear, 10),
        designatedCommissionerEmail: designatedCommissionerEmail.trim() || undefined,
      };

      const response = await requestJson<{ league: { id: string } }>("/api/leagues", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      // Activate the new league and navigate to it
      await requestJson("/api/auth/entry-resolver", {
        method: "POST",
        body: JSON.stringify({ leagueId: response.league.id }),
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

  function handleNextStep() {
    if (step === "basics" && isBasicsValid()) {
      setStep("options");
    } else if (step === "options" && isOptionsValid()) {
      setStep("review");
    }
  }

  function handlePrevStep() {
    if (step === "options") {
      setStep("basics");
    } else if (step === "review") {
      setStep("options");
    }
  }

  function handleCancel() {
    router.push("/my-leagues");
  }

  const getStepTitle = () => {
    switch (step) {
      case "basics":
        return "League Basics";
      case "options":
        return "League Options";
      case "review":
        return "Review & Create";
      default:
        return "Create New League";
    }
  };

  const getStepDescription = () => {
    switch (step) {
      case "basics":
        return "Start by giving your league a name and setting the season year.";
      case "options":
        return "Add optional details or skip ahead — you can always configure these later in League Settings.";
      case "review":
        return "Review your settings and create your dynasty football league.";
      default:
        return "";
    }
  };

  const getCurrentStepNumber = () => {
    switch (step) {
      case "basics": return 1;
      case "options": return 2;
      case "review": return 3;
      default: return 1;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--background)" }} data-testid="league-create-wizard">
      {/* Progress indicator */}
      <div className="border-b" style={{ borderColor: "var(--brand-structure-muted)" }}>
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center gap-3">
            <Link 
              href="/my-leagues"
              className="text-sm font-medium transition-colors hover:text-[var(--brand-accent-primary)]"
              style={{ color: "var(--muted-foreground)" }}
            >
              ← Dynasty Football Hub
            </Link>
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              /
            </span>
            <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              Create League
            </span>
          </div>
          
          {/* Step Progress */}
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                step === "basics" ? "bg-[var(--brand-accent-primary)] text-[var(--brand-midnight-navy)]" : 
                getCurrentStepNumber() > 1 ? "bg-green-600 text-white" : "bg-gray-600 text-gray-300"
              }`} data-testid="league-create-step-basics" aria-current={step === "basics" ? "step" : undefined}>
                {getCurrentStepNumber() > 1 ? "✓" : "1"}
              </div>
              <span className="text-sm font-medium" style={{ color: step === "basics" ? "var(--foreground)" : "var(--muted-foreground)" }}>
                Basics
              </span>
            </div>
            
            <div className="h-px w-8 bg-gray-600"></div>
            
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                step === "options" ? "bg-[var(--brand-accent-primary)] text-[var(--brand-midnight-navy)]" : 
                getCurrentStepNumber() > 2 ? "bg-green-600 text-white" : "bg-gray-600 text-gray-300"
              }`} data-testid="league-create-step-options" aria-current={step === "options" ? "step" : undefined}>
                {getCurrentStepNumber() > 2 ? "✓" : "2"}
              </div>
              <span className="text-sm font-medium" style={{ color: step === "options" ? "var(--foreground)" : "var(--muted-foreground)" }}>
                Options
              </span>
            </div>
            
            <div className="h-px w-8 bg-gray-600"></div>
            
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${
                step === "review" ? "bg-[var(--brand-accent-primary)] text-[var(--brand-midnight-navy)]" : "bg-gray-600 text-gray-300"
              }`} data-testid="league-create-step-review" aria-current={step === "review" ? "step" : undefined}>
                3
              </div>
              <span className="text-sm font-medium" style={{ color: step === "review" ? "var(--foreground)" : "var(--muted-foreground)" }}>
                Review
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4" style={{ color: "var(--foreground)" }}>
            {getStepTitle()}
          </h1>
          <p className="text-lg" style={{ color: "var(--muted-foreground)" }}>
            {getStepDescription()}
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

          {stepErrors.length > 0 && (
            <div
              className="mb-6 rounded-md border border-red-700/70 bg-red-950/40 px-4 py-3 text-sm text-red-100"
              role="alert"
            >
              <p className="font-medium mb-2">Please fix the following:</p>
              <ul className="space-y-1">
                {stepErrors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {step === "basics" && (
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
                  data-testid="no-league-create-name"
                />
                {name.trim().length > 0 && name.trim().length < 3 && (
                  <p className="mt-1 text-xs text-red-400" data-testid="league-create-name-error">
                    League name must be at least 3 characters
                  </p>
                )}
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Choose a memorable name that reflects your league's personality.
                </p>
              </div>

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
                  data-testid="no-league-create-season-year"
                />
                {(() => {
                  const year = parseInt(seasonYear);
                  const currentYear = new Date().getFullYear();
                  if (seasonYear && (year < currentYear || year > currentYear + 5)) {
                    return (
                      <p className="mt-1 text-xs text-red-400" data-testid="league-create-season-year-error">
                        Season year must be between {currentYear} and {currentYear + 5}
                      </p>
                    );
                  }
                  return null;
                })()}
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  The year your dynasty league season will take place.
                </p>
              </div>
            </div>
          )}

          {step === "options" && (
            <div className="space-y-6">
              <div className="rounded-lg border p-4 mb-6" style={{ 
                borderColor: "var(--brand-structure-muted)", 
                backgroundColor: "var(--brand-surface-card)" 
              }}>
                <p className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
                  These are completely optional
                </p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  You can skip this step and configure these settings later in League Settings after your league is created.
                </p>
              </div>

              <div>
                <label 
                  htmlFor="description"
                  className="block text-sm font-semibold mb-2" 
                  style={{ color: "var(--foreground)" }}
                >
                  League Description <span className="text-xs font-normal text-gray-400">(Optional)</span>
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
                  autoFocus
                  data-testid="no-league-create-description"
                />
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Help new members understand what makes your league special.
                </p>
              </div>

              <div>
                <label 
                  htmlFor="commissioner-email"
                  className="block text-sm font-semibold mb-2" 
                  style={{ color: "var(--foreground)" }}
                >
                  Alternate Commissioner <span className="text-xs font-normal text-gray-400">(Optional)</span>
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
                  data-testid="no-league-create-designated-commissioner-email"
                />
                {designatedCommissionerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(designatedCommissionerEmail.trim()) && (
                  <p className="mt-1 text-xs text-red-400" data-testid="league-create-designated-commissioner-error">
                    Please enter a valid email address
                  </p>
                )}
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Leave blank to make yourself the commissioner. You can transfer ownership later in League Settings.
                </p>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="space-y-6" data-testid="league-create-review-step">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
                  Review Your League
                </h3>
                
                <div className="grid gap-3">
                  <div className="flex justify-between items-start py-3 border-b" style={{ borderColor: "var(--brand-structure-muted)" }}>
                    <div>
                      <p className="font-medium" style={{ color: "var(--foreground)" }}>League Name</p>
                    </div>
                    <p className="font-medium" style={{ color: "var(--foreground)" }}>{name}</p>
                  </div>
                  
                  <div className="flex justify-between items-start py-3 border-b" style={{ borderColor: "var(--brand-structure-muted)" }}>
                    <div>
                      <p className="font-medium" style={{ color: "var(--foreground)" }}>Season Year</p>
                    </div>
                    <p className="font-medium" style={{ color: "var(--foreground)" }}>{seasonYear}</p>
                  </div>
                  
                  <div className="flex justify-between items-start py-3 border-b" style={{ borderColor: "var(--brand-structure-muted)" }}>
                    <div>
                      <p className="font-medium" style={{ color: "var(--foreground)" }}>Description</p>
                    </div>
                    <p className="font-medium text-right max-w-xs" style={{ 
                      color: description.trim() ? "var(--foreground)" : "var(--muted-foreground)" 
                    }}>
                      {description.trim() || "Not provided"}
                    </p>
                  </div>
                  
                  <div className="flex justify-between items-start py-3 border-b" style={{ borderColor: "var(--brand-structure-muted)" }}>
                    <div>
                      <p className="font-medium" style={{ color: "var(--foreground)" }}>Initial Commissioner</p>
                    </div>
                    <p className="font-medium text-right" style={{ color: "var(--foreground)" }}>
                      You (your account)
                    </p>
                  </div>
                  
                  <div className="flex justify-between items-start py-3" style={{ borderColor: "var(--brand-structure-muted)" }}>
                    <div>
                      <p className="font-medium" style={{ color: "var(--foreground)" }}>Alternate Commissioner</p>
                    </div>
                    <p className="font-medium text-right" style={{ 
                      color: designatedCommissionerEmail.trim() ? "var(--foreground)" : "var(--muted-foreground)" 
                    }}>
                      {designatedCommissionerEmail.trim() || "None"}
                    </p>
                  </div>
                </div>
              </div>
              
              <div className="rounded-lg border p-5" style={{ 
                borderColor: "var(--brand-structure-muted)", 
                backgroundColor: "var(--brand-surface-card)" 
              }}>
                <h4 className="font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                  What happens when you create this league?
                </h4>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium mb-1" style={{ color: "var(--foreground)" }}>League Setup:</p>
                    <p style={{ color: "var(--muted-foreground)" }}>
                      Your <strong>{name}</strong> league will be created for the {seasonYear} season and become your active league.
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-1" style={{ color: "var(--foreground)" }}>Your Role:</p>
                    <p style={{ color: "var(--muted-foreground)" }}>
                      You'll be the league commissioner with full administrative rights. 
                      {designatedCommissionerEmail.trim() ? 
                        ` An invitation will be sent to ${designatedCommissionerEmail.trim()} to become an alternate commissioner.` : 
                        " You can add other commissioners later in League Settings."
                      }
                    </p>
                  </div>
                  
                  <div>
                    <p className="font-medium mb-1" style={{ color: "var(--foreground)" }}>What's Next:</p>
                    <p style={{ color: "var(--muted-foreground)" }}>
                      You'll be taken to your league dashboard where you can invite members, set up teams, configure rules, and start building your dynasty football league.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-4 items-center justify-between mt-8 pt-6 border-t" style={{ borderColor: "var(--brand-structure-muted)" }}>
            <div>
              {step !== "basics" && (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="px-6 py-2.5 text-sm font-medium transition-colors rounded-lg hover:bg-[var(--brand-structure-muted)]"
                  style={{ color: "var(--muted-foreground)" }}
                  data-testid="league-create-back"
                >
                  Back
                </button>
              )}
            </div>
            
            <div className="flex gap-4">
              <button
                type="button"
                onClick={handleCancel}
                className="px-6 py-2.5 text-sm font-medium transition-colors rounded-lg hover:bg-[var(--brand-structure-muted)]"
                style={{ color: "var(--muted-foreground)" }}
              >
                Cancel
              </button>
              
              {step === "basics" && (
                <button
                  type="button"
                  onClick={handleNextStep}
                  disabled={!isBasicsValid()}
                  className="rounded-lg bg-[var(--brand-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="league-create-next-options"
                >
                  Continue to Options
                </button>
              )}
              
              {step === "options" && (
                <>
                  <button
                    type="button"
                    onClick={() => setStep("review")}
                    className="rounded-lg bg-[var(--brand-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                    data-testid="league-create-skip-options"
                  >
                    Skip for Now
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={designatedCommissionerEmail.trim().length > 0 && !isOptionsValid()}
                    className="px-6 py-2.5 text-sm font-medium transition-colors rounded-lg hover:bg-[var(--brand-structure-muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ color: "var(--foreground)" }}
                    data-testid="league-create-next-review"
                  >
                    Continue to Review
                  </button>
                </>
              )}
              
              {step === "review" && (
                <button
                  type="submit"
                  disabled={creating || stepErrors.length > 0}
                  className="rounded-lg bg-[var(--brand-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="league-create-submit-button"
                >
                  {creating ? "Creating League..." : "Create League"}
                </button>
              )}
            </div>
          </div>
        </form>

        {creating && (
          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              League created. Opening league home...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}