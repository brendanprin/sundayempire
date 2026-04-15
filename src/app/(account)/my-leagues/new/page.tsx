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
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<CreateLeagueWizardStep>("basics");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seasonYear, setSeasonYear] = useState(String(new Date().getFullYear()));
  const [designatedCommissionerEmail, setDesignatedCommissionerEmail] = useState("");
  
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Enhanced validation helpers
  const getNameValidation = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return { valid: false, error: "" }; // No error for empty (user hasn't started typing)
    if (trimmed.length < 3) return { valid: false, error: "League name must be at least 3 characters long" };
    if (trimmed.length > 50) return { valid: false, error: "League name cannot be longer than 50 characters" };
    if (!/^[a-zA-Z0-9\s\-'&.]+$/.test(trimmed)) return { valid: false, error: "League name can only contain letters, numbers, spaces, hyphens, apostrophes, ampersands, and periods" };
    if (/^[\s\-'.&]+$/.test(trimmed)) return { valid: false, error: "League name must contain at least some letters or numbers" };
    return { valid: true, error: "" };
  };

  const getYearValidation = () => {
    const year = parseInt(seasonYear);
    const currentYear = new Date().getFullYear();
    if (isNaN(year)) return { valid: false, error: "Please enter a valid year" };
    if (year < currentYear) return { valid: false, error: `Season year cannot be in the past (must be ${currentYear} or later)` };
    if (year > currentYear + 5) return { valid: false, error: `Season year cannot be more than 5 years in the future (must be ${currentYear + 5} or earlier)` };
    return { valid: true, error: "" };
  };

  const isBasicsValid = () => {
    const nameValidation = getNameValidation();
    const yearValidation = getYearValidation();
    return nameValidation.valid && yearValidation.valid;
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
      const nameValidation = getNameValidation();
      if (!nameValidation.valid && nameValidation.error) {
        errors.push(nameValidation.error);
      }
      
      const yearValidation = getYearValidation();
      if (!yearValidation.valid && yearValidation.error) {
        errors.push(yearValidation.error);
      }
    }
    
    if ((step === "options" || step === "review") && designatedCommissionerEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(designatedCommissionerEmail.trim())) {
        errors.push("Please enter a valid email address for the alternate commissioner");
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

      // Navigate directly to the new league workspace
      router.push(`/league/${response.league.id}`);
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

  function handleKeyPress(event: React.KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (step === "basics" && isBasicsValid()) {
        handleNextStep();
      } else if (step === "options" && isOptionsValid()) {
        handleNextStep();
      } else if (step === "review" && stepErrors.length === 0) {
        const form = event.currentTarget.closest('form');
        if (form) form.requestSubmit();
      }
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
        return "Start with a memorable name and choose your season year — these form the foundation of your dynasty league.";
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
    <div className="min-h-screen px-4 py-8" style={{ backgroundColor: "var(--background)" }} data-testid="league-create-wizard">
      {/* Simple breadcrumb */}
      <div className="mx-auto max-w-2xl mb-8">
        <Link 
          href="/my-leagues"
          className="inline-flex items-center gap-2 text-sm transition-colors hover:text-[var(--brand-accent-primary)]"
          style={{ color: "var(--muted-foreground)" }}
        >
          ← Back to Dynasty Football Hub
        </Link>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-4" style={{ color: "var(--foreground)" }}>
            {getStepTitle()}
          </h1>
          <p className="text-lg" style={{ color: "var(--muted-foreground)" }}>
            {getStepDescription()}
          </p>
          
          {/* Step Progress - simplified */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {["Basics", "Options", "Review"].map((stepName, index) => {
              const stepNumber = index + 1;
              const isActive = getCurrentStepNumber() === stepNumber;
              const isCompleted = getCurrentStepNumber() > stepNumber;
              
              return (
                <div key={stepName} className="flex items-center">
                  {index > 0 && <div className="h-px w-8 mx-2 bg-gray-600"></div>}
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isActive ? "bg-[var(--brand-accent-primary)] text-[var(--brand-midnight-navy)]" : 
                    isCompleted ? "bg-green-600 text-white" : "bg-gray-600 text-gray-300"
                  }`}>
                    {isCompleted ? "✓" : stepNumber}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form 
          onSubmit={handleSubmit}
          onKeyDown={handleKeyPress}
          className="rounded-xl border p-8 max-w-lg mx-auto"
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
                    borderColor: (() => {
                      const nameValidation = getNameValidation();
                      if (name.trim().length === 0) return "var(--brand-structure-muted)";
                      return nameValidation.valid ? "var(--brand-accent-primary)" : "#ef4444";
                    })(),
                    color: "var(--foreground)",
                  }}
                  placeholder="Sunday Empire League"
                  autoFocus
                  required
                  maxLength={50}
                  data-testid="no-league-create-name"
                />
                {(() => {
                  const nameValidation = getNameValidation();
                  if (nameValidation.error) {
                    return (
                      <p className="mt-1 text-xs text-red-400" data-testid="league-create-name-error">
                        {nameValidation.error}
                      </p>
                    );
                  }
                  if (nameValidation.valid) {
                    return (
                      <p className="mt-1 text-xs text-green-400">
                        ✓ Perfect! This name looks good.
                      </p>
                    );
                  }
                  return null;
                })()}
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Choose a memorable name that reflects your league's personality and traditions.
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
                    borderColor: (() => {
                      const yearValidation = getYearValidation();
                      return yearValidation.valid ? "var(--brand-accent-primary)" : 
                             yearValidation.error ? "#ef4444" : "var(--brand-structure-muted)";
                    })(),
                    color: "var(--foreground)",
                  }}
                  min={new Date().getFullYear()}
                  max={new Date().getFullYear() + 5}
                  required
                  data-testid="no-league-create-season-year"
                />
                {(() => {
                  const yearValidation = getYearValidation();
                  if (yearValidation.error) {
                    return (
                      <p className="mt-1 text-xs text-red-400" data-testid="league-create-season-year-error">
                        {yearValidation.error}
                      </p>
                    );
                  }
                  if (yearValidation.valid) {
                    return (
                      <p className="mt-1 text-xs text-green-400">
                        ✓ {seasonYear === String(new Date().getFullYear()) ? "Perfect! Starting this season." : `Great choice for ${seasonYear}.`}
                      </p>
                    );
                  }
                  return null;
                })()}
                <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Pick your first dynasty season year. Most leagues start with the current NFL season ({new Date().getFullYear()}).
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
                <>
                  <button
                    type="button"
                    onClick={handleNextStep}
                    disabled={!isBasicsValid()}
                    className="rounded-lg bg-[var(--brand-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                    data-testid="league-create-next-options"
                  >
                    Continue to Options
                  </button>
                  {isBasicsValid() && (
                    <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
                      Press Enter to continue
                    </p>
                  )}
                </>
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
                  disabled={creating || success || stepErrors.length > 0}
                  className="rounded-lg bg-[var(--brand-accent-primary)] px-6 py-2.5 text-sm font-semibold text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="league-create-submit-button"
                >
                  {creating ? "Creating League..." : "Create League"}
                </button>
              )}
            </div>
          </div>
        </form>

        {(creating || success) && (
          <div className="mt-6 text-center">
            {creating && (
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Creating your league...
              </p>
            )}
            {success && (
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: "var(--brand-accent-primary)" }}>
                  ✓ {name} created successfully
                </p>
                <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  Welcome to your new league workspace. Opening dashboard...
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}