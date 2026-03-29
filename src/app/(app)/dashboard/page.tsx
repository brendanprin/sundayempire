"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import {
  LOGIN_ERROR_SESSION_EXPIRED,
  buildLoginPath,
} from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import { LeagueSummaryPayload } from "@/types/league";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type LeagueWorkspace = {
  id: string;
  name: string;
  description: string | null;
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  season: {
    id: string;
    year: number;
    phase: LeagueSummaryPayload["season"]["phase"];
  } | null;
  counts: {
    teams: number;
    memberships: number;
  };
  createdAt: string;
};

type LeagueWorkspacesPayload = {
  leagues: LeagueWorkspace[];
};

type CreateLeagueWizardStep = "basics" | "options" | "review";

const CREATE_LEAGUE_WIZARD_STEPS: {
  id: CreateLeagueWizardStep;
  label: string;
}[] = [
  { id: "basics", label: "Basics" },
  { id: "options", label: "Options" },
  { id: "review", label: "Review" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatMembershipContext(league: LeagueWorkspace) {
  if (league.leagueRole === "COMMISSIONER") {
    return league.teamName
      ? `Commissioner · Team: ${league.teamName}`
      : "Commissioner";
  }

  return league.teamName
    ? `Member · Team: ${league.teamName}`
    : "Member";
}

function parseInviteToken(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }

  try {
    const parsedUrl = new URL(trimmed);
    const token = parsedUrl.searchParams.get("token")?.trim() ?? "";
    if (token.length > 0) {
      return token;
    }
  } catch {
    // Treat non-URL input as a direct token value.
  }

  return trimmed;
}

function urgencyForPhase(phase: LeagueSummaryPayload["season"]["phase"] | null | undefined) {
  if (!phase) {
    return {
      label: "Not configured",
      className: "border-slate-700 bg-slate-900 text-slate-200",
    };
  }
  if (phase === "REGULAR_SEASON") {
    return {
      label: "Regular Season",
      className: "border-emerald-700/60 bg-emerald-950/30 text-emerald-100",
    };
  }
  if (phase === "PLAYOFFS") {
    return {
      label: "Playoffs",
      className: "border-amber-700/60 bg-amber-950/30 text-amber-100",
    };
  }
  if (phase === "PRESEASON") {
    return {
      label: "Preseason",
      className: "border-sky-700/60 bg-sky-950/30 text-sky-100",
    };
  }
  return {
    label: "Offseason",
    className: "border-slate-700 bg-slate-900 text-slate-200",
  };
}

export default function LeagueDirectoryPage() {
  const router = useRouter();
  const [leagues, setLeagues] = useState<LeagueWorkspace[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [activatingLeagueId, setActivatingLeagueId] = useState<string | null>(null);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [createLeagueName, setCreateLeagueName] = useState("");
  const [createLeagueDescription, setCreateLeagueDescription] = useState("");
  const [designatedCommissionerEmail, setDesignatedCommissionerEmail] = useState("");
  const [createLeagueSeasonYear, setCreateLeagueSeasonYear] = useState(
    String(new Date().getFullYear()),
  );
  const [createLeagueWizardOpen, setCreateLeagueWizardOpen] = useState(false);
  const [createLeagueWizardStep, setCreateLeagueWizardStep] =
    useState<CreateLeagueWizardStep>("basics");
  const [joinInviteValue, setJoinInviteValue] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const directoryOpenedAt = useRef(0);
  const directoryViewTracked = useRef(false);
  const autoRedirectStarted = useRef(false);
  const noLeagueWizardAutoOpened = useRef(false);
  const wizardErrorRef = useRef<HTMLDivElement | null>(null);
  const createLeagueNameInputRef = useRef<HTMLInputElement | null>(null);
  const createLeagueDescriptionInputRef = useRef<HTMLInputElement | null>(null);
  const createLeagueSubmitButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    directoryOpenedAt.current = Date.now();
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    requestJson<LeagueWorkspacesPayload>("/api/leagues", { cache: "no-store" }, "Failed to load leagues.")
      .then((payload) => {
        if (!mounted) {
          return;
        }
        setLeagues(payload.leagues);
        setError(null);
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }

        if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
          window.location.assign(
            buildLoginPath({
              returnTo: "/dashboard",
              error: LOGIN_ERROR_SESSION_EXPIRED,
            }),
          );
          return;
        }

        setError(requestError instanceof Error ? requestError.message : "Failed to load leagues.");
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const orderedLeagues = useMemo(() => {
    return [...leagues].sort((left, right) => {
      const leftSeason = left.season?.year ?? 0;
      const rightSeason = right.season?.year ?? 0;
      if (leftSeason !== rightSeason) {
        return rightSeason - leftSeason;
      }
      return left.name.localeCompare(right.name);
    });
  }, [leagues]);

  useEffect(() => {
    if (isLoading || orderedLeagues.length !== 0 || noLeagueWizardAutoOpened.current) {
      return;
    }

    noLeagueWizardAutoOpened.current = true;
    setCreateLeagueWizardOpen(true);
  }, [isLoading, orderedLeagues.length]);

  useEffect(() => {
    if (orderedLeagues.length === 0 || directoryViewTracked.current) {
      return;
    }

    directoryViewTracked.current = true;
    trackUiEvent({
      eventType: PILOT_EVENT_TYPES.UI_LEAGUE_DIRECTORY_VIEWED,
      pagePath: "/dashboard",
      eventStep: "view",
      status: "success",
      entityType: "league_directory",
      entityId: "root",
      context: {
        leagueCount: orderedLeagues.length,
      },
    });
  }, [orderedLeagues.length]);

  async function activateLeague(league: LeagueWorkspace, source: "directory" | "auto_single") {
    setActivatingLeagueId(league.id);
    setError(null);

    try {
      if (source === "directory") {
        trackUiEvent({
          eventType: PILOT_EVENT_TYPES.UI_LEAGUE_SELECTED,
          pagePath: "/dashboard",
          eventStep: "select",
          status: "success",
          entityType: "league",
          entityId: league.id,
          context: {
            leagueRole: league.leagueRole,
            hasTeamContext: Boolean(league.teamId),
            elapsedMs: Date.now() - directoryOpenedAt.current,
          },
        });
      }

      await requestJson(
        "/api/league/context",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            leagueId: league.id,
          }),
        },
        "Failed to activate selected league.",
      );

      router.push(`/league/${league.id}`);
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        window.location.assign(
          buildLoginPath({
            returnTo: "/dashboard",
            error: LOGIN_ERROR_SESSION_EXPIRED,
          }),
        );
        return;
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : "Failed to activate selected league.",
      );
      setActivatingLeagueId((current) => (current === league.id ? null : current));
    }
  }

  useEffect(() => {
    if (isLoading || error || orderedLeagues.length !== 1 || autoRedirectStarted.current) {
      return;
    }

    autoRedirectStarted.current = true;
    void activateLeague(orderedLeagues[0], "auto_single");
  }, [error, isLoading, orderedLeagues]);

  function openCreateLeagueWizard() {
    setError(null);
    setWizardError(null);
    setCreateLeagueWizardStep("basics");
    setCreateLeagueWizardOpen(true);
  }

  function validateCreateLeagueBasics() {
    const trimmedName = createLeagueName.trim();
    if (trimmedName.length < 2) {
      setWizardError("League name must be at least 2 characters.");
      return false;
    }

    const seasonYear = Number.parseInt(createLeagueSeasonYear.trim(), 10);
    if (!Number.isInteger(seasonYear)) {
      setWizardError("Season year must be a valid integer.");
      return false;
    }

    if (seasonYear < 2000 || seasonYear > 2100) {
      setWizardError("Season year must be between 2000 and 2100.");
      return false;
    }

    return true;
  }

  function validateCreateLeagueOptions() {
    const normalizedCommissionerEmail = designatedCommissionerEmail.trim().toLowerCase();
    if (normalizedCommissionerEmail && !EMAIL_PATTERN.test(normalizedCommissionerEmail)) {
      setWizardError("Alternate commissioner email must be a valid email address.");
      return false;
    }

    return true;
  }

  function continueCreateLeagueWizardToOptions() {
    if (!validateCreateLeagueBasics()) {
      return;
    }
    setWizardError(null);
    setCreateLeagueWizardStep("options");
  }

  function continueCreateLeagueWizardToReview() {
    if (!validateCreateLeagueBasics() || !validateCreateLeagueOptions()) {
      return;
    }
    setWizardError(null);
    setCreateLeagueWizardStep("review");
  }

  async function handleCreateLeague() {
    if (creatingLeague) {
      return;
    }

    if (!validateCreateLeagueBasics() || !validateCreateLeagueOptions()) {
      return;
    }

    const trimmedName = createLeagueName.trim();
    const seasonYear = Number.parseInt(createLeagueSeasonYear.trim(), 10);

    setCreatingLeague(true);
    setError(null);
    setWizardError(null);

    try {
      const payload = await requestJson<{
        league: {
          id: string;
          name: string;
        };
      }>(
        "/api/leagues",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            name: trimmedName,
            description: createLeagueDescription.trim() || null,
            seasonYear,
            designatedCommissionerEmail: designatedCommissionerEmail.trim().toLowerCase() || null,
          }),
        },
        "Failed to create league.",
      );

      router.push(`/league/${payload.league.id}`);
      router.refresh();
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.code === "AUTH_REQUIRED") {
        window.location.assign(
          buildLoginPath({
            returnTo: "/dashboard",
            error: LOGIN_ERROR_SESSION_EXPIRED,
          }),
        );
        return;
      }

      setWizardError(requestError instanceof Error ? requestError.message : "Failed to create league.");
      setCreatingLeague(false);
    }
  }

  function handleJoinLeague() {
    const token = parseInviteToken(joinInviteValue);
    if (!token) {
      setError("Enter a valid invite link or token.");
      return;
    }

    setError(null);
    router.push(`/invite?token=${encodeURIComponent(token)}&returnTo=${encodeURIComponent("/dashboard")}`);
  }

  async function handleSignOut() {
    setSigningOut(true);
    setError(null);

    try {
      await requestJson(
        "/api/auth/session",
        {
          method: "DELETE",
        },
        "Could not clear the current session.",
      );

      window.location.assign("/login");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not clear the current session.",
      );
      setSigningOut(false);
    }
  }

  const heading =
    orderedLeagues.length === 0
      ? "No League Access Yet"
      : orderedLeagues.length === 1
        ? "Opening League Workspace"
        : "Choose a League";
  const description =
    orderedLeagues.length === 0
      ? "This account is signed in but not attached to a league yet. Create a new league or join an existing one by invite."
      : orderedLeagues.length === 1
        ? "You only have one accessible league, so we're routing you straight into that workspace."
        : "Your identity has access to multiple leagues. Pick one workspace to continue.";

  useEffect(() => {
    if (!createLeagueWizardOpen) {
      return;
    }

    if (createLeagueWizardStep === "basics") {
      createLeagueNameInputRef.current?.focus();
      return;
    }

    if (createLeagueWizardStep === "options") {
      createLeagueDescriptionInputRef.current?.focus();
      return;
    }

    createLeagueSubmitButtonRef.current?.focus();
  }, [createLeagueWizardOpen, createLeagueWizardStep]);

  useEffect(() => {
    if (!wizardError) {
      return;
    }

    wizardErrorRef.current?.focus();
  }, [wizardError]);

  function renderCreateLeagueWizard(input: {
    allowClose: boolean;
    closeTestId: string;
  }) {
    const currentStepIndex = CREATE_LEAGUE_WIZARD_STEPS.findIndex(
      (step) => step.id === createLeagueWizardStep,
    );
    const trimmedName = createLeagueName.trim();
    const parsedSeasonYear = Number.parseInt(createLeagueSeasonYear.trim(), 10);
    const basicsValid =
      trimmedName.length >= 2 &&
      Number.isInteger(parsedSeasonYear) &&
      parsedSeasonYear >= 2000 &&
      parsedSeasonYear <= 2100;
    const leagueNameInvalid = trimmedName.length > 0 && trimmedName.length < 2;
    const seasonYearInvalid =
      createLeagueSeasonYear.trim().length > 0 &&
      (!Number.isInteger(parsedSeasonYear) || parsedSeasonYear < 2000 || parsedSeasonYear > 2100);
    const normalizedCommissionerEmail = designatedCommissionerEmail.trim().toLowerCase();
    const optionsValid = !normalizedCommissionerEmail || EMAIL_PATTERN.test(normalizedCommissionerEmail);
    const designatedCommissionerInvalid = Boolean(normalizedCommissionerEmail && !optionsValid);

    return (
      <section
        className="space-y-4 rounded-lg border p-4"
        style={{
          borderColor: "var(--brand-structure-muted)",
          backgroundColor: "var(--brand-surface-elevated)",
        }}
        data-testid="league-create-wizard"
        role="region"
        aria-label="Create league wizard"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p
              className="text-[11px] uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              Guided Setup
            </p>
            <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
              Create League
            </h3>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              Complete the three guided steps: basics, optional commissioner settings, then final review.
            </p>
          </div>
          {input.allowClose ? (
            <button
              type="button"
              onClick={() => {
                setWizardError(null);
                setCreateLeagueWizardOpen(false);
              }}
              className="rounded-md border border-[var(--brand-structure-muted)] px-3 py-1.5 text-xs transition hover:border-[var(--brand-structure)]"
              style={{ color: "var(--foreground)" }}
              data-testid={input.closeTestId}
            >
              Hide Wizard
            </button>
          ) : null}
        </div>

        <ol
          className="flex flex-wrap gap-2"
          data-testid="league-create-wizard-steps"
          aria-label="Create league progress"
        >
          {CREATE_LEAGUE_WIZARD_STEPS.map((step, index) => {
            const isCurrent = step.id === createLeagueWizardStep;
            const isComplete = currentStepIndex > index;

            return (
              <li
                key={step.id}
                className={`rounded-full border px-2.5 py-1 text-xs ${
                  isCurrent
                    ? "border-sky-600 bg-sky-950/40 text-sky-100"
                    : isComplete
                      ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-100"
                      : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
                data-testid={`league-create-step-${step.id}`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {index + 1}. {step.label}
              </li>
            );
          })}
        </ol>

        {wizardError ? (
          <div
            ref={wizardErrorRef}
            className="rounded-md border border-red-700/70 bg-red-950/40 px-3 py-2 text-sm text-red-100"
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            data-testid="league-create-wizard-error"
          >
            {wizardError}
          </div>
        ) : null}

        {createLeagueWizardStep === "basics" ? (
          <div className="space-y-3" data-testid="league-create-wizard-basics">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Start with a league name and active season year.
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
                  League Name
                </span>
                <input
                  ref={createLeagueNameInputRef}
                  type="text"
                  value={createLeagueName}
                  onChange={(event) => {
                    setCreateLeagueName(event.target.value);
                    setWizardError(null);
                  }}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  placeholder="Sunday Empire League"
                  data-testid="no-league-create-name"
                  aria-invalid={leagueNameInvalid}
                  aria-describedby="league-create-basics-hint"
                />
                {leagueNameInvalid ? (
                  <p className="text-xs text-red-200" data-testid="league-create-name-error">
                    League name must be at least 2 characters.
                  </p>
                ) : null}
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
                  Season Year
                </span>
                <input
                  type="number"
                  value={createLeagueSeasonYear}
                  onChange={(event) => {
                    setCreateLeagueSeasonYear(event.target.value);
                    setWizardError(null);
                  }}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  data-testid="no-league-create-season-year"
                  aria-invalid={seasonYearInvalid}
                  aria-describedby="league-create-basics-hint"
                />
                {seasonYearInvalid ? (
                  <p className="text-xs text-red-200" data-testid="league-create-season-year-error">
                    Season year must be between 2000 and 2100.
                  </p>
                ) : null}
              </label>
            </div>
            <p
              id="league-create-basics-hint"
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              League name must be at least 2 characters. Season year must be between 2000 and 2100.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={continueCreateLeagueWizardToOptions}
                disabled={!basicsValid}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                data-testid="league-create-next-options"
                aria-disabled={!basicsValid}
              >
                Continue to Options
              </button>
            </div>
          </div>
        ) : null}

        {createLeagueWizardStep === "options" ? (
          <div className="space-y-3" data-testid="league-create-wizard-options">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Add optional context and designate another commissioner only if needed.
            </p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
                  Description
                </span>
                <input
                  ref={createLeagueDescriptionInputRef}
                  type="text"
                  value={createLeagueDescription}
                  onChange={(event) => {
                    setCreateLeagueDescription(event.target.value);
                    setWizardError(null);
                  }}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  placeholder="Optional"
                  data-testid="no-league-create-description"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs uppercase tracking-[0.14em]" style={{ color: "var(--muted-foreground)" }}>
                  Alternate Commissioner (Optional)
                </span>
                <input
                  type="email"
                  value={designatedCommissionerEmail}
                  onChange={(event) => {
                    setDesignatedCommissionerEmail(event.target.value);
                    setWizardError(null);
                  }}
                  className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  placeholder="commissioner@example.com"
                  data-testid="no-league-create-designated-commissioner-email"
                  aria-invalid={designatedCommissionerInvalid}
                  aria-describedby="league-create-options-hint"
                />
                {designatedCommissionerInvalid ? (
                  <p
                    className="text-xs text-red-200"
                    data-testid="league-create-designated-commissioner-error"
                  >
                    Alternate commissioner email must be a valid email address.
                  </p>
                ) : null}
              </label>
            </div>
            <p
              id="league-create-options-hint"
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              Leave alternate commissioner blank to keep the creating account as commissioner.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWizardError(null);
                  setCreateLeagueWizardStep("basics");
                }}
                className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)]"
                style={{ color: "var(--foreground)" }}
                data-testid="league-create-back-basics"
              >
                Back
              </button>
              <button
                type="button"
                onClick={continueCreateLeagueWizardToReview}
                disabled={!basicsValid || !optionsValid}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                data-testid="league-create-next-review"
                aria-disabled={!basicsValid || !optionsValid}
              >
                Continue to Review
              </button>
            </div>
          </div>
        ) : null}

        {createLeagueWizardStep === "review" ? (
          <div className="space-y-3" data-testid="league-create-wizard-review">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Confirm details, then create and open league home.
            </p>
            <div
              className="grid grid-cols-1 gap-2 rounded-md border p-3 text-sm"
              style={{
                borderColor: "var(--brand-structure-muted)",
                color: "var(--foreground)",
              }}
              data-testid="league-create-review-step"
            >
              <p>
                <span style={{ color: "var(--muted-foreground)" }}>League Name:</span>{" "}
                {createLeagueName.trim() || "Not set"}
              </p>
              <p>
                <span style={{ color: "var(--muted-foreground)" }}>Season Year:</span>{" "}
                {createLeagueSeasonYear.trim() || "Not set"}
              </p>
              <p>
                <span style={{ color: "var(--muted-foreground)" }}>Description:</span>{" "}
                {createLeagueDescription.trim() || "Not provided"}
              </p>
              <p>
                <span style={{ color: "var(--muted-foreground)" }}>Commissioner:</span>{" "}
                {designatedCommissionerEmail.trim()
                  ? `${designatedCommissionerEmail.trim()} (designated)`
                  : "Creator account (default)"}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setWizardError(null);
                  setCreateLeagueWizardStep("options");
                }}
                className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)]"
                style={{ color: "var(--foreground)" }}
                data-testid="league-create-back-options"
              >
                Back
              </button>
              <button
                ref={createLeagueSubmitButtonRef}
                type="button"
                onClick={() => {
                  void handleCreateLeague();
                }}
                disabled={creatingLeague || !basicsValid || !optionsValid}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="league-create-submit-button"
                aria-disabled={creatingLeague || !basicsValid || !optionsValid}
              >
                {creatingLeague ? "Creating League and Opening Workspace..." : "Create League"}
              </button>
            </div>
            {creatingLeague ? (
              <p
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
                data-testid="league-create-submit-progress"
              >
                Creating league records and activating your new workspace.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <div className="space-y-6" data-testid="league-directory-page">
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
          {heading}
        </h2>
        <p
          className="text-sm"
          style={{ color: "var(--muted-foreground)" }}
        >
          {description}
        </p>
      </header>

      {error ? (
        <div
          className="rounded-md px-4 py-3 text-sm text-red-200"
          style={{
            border: "1px solid rgb(185, 28, 28)",
            backgroundColor: "rgba(69, 10, 10, 0.4)",
          }}
          role="alert"
          aria-live="assertive"
          data-testid="league-directory-error"
        >
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div
          className="rounded-lg p-6 text-sm"
          style={{
            border: "1px solid var(--brand-structure-muted)",
            backgroundColor: "var(--brand-surface-card)",
            color: "var(--muted-foreground)",
          }}
        >
          Loading your signed-in league access...
        </div>
      ) : null}

      {!isLoading && orderedLeagues.length === 0 && !error ? (
        <section
          className="rounded-lg p-6"
          style={{
            border: "1px solid var(--brand-structure-muted)",
            backgroundColor: "var(--brand-surface-card)",
          }}
          data-testid="league-entry-empty-state"
        >
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              No league memberships are attached to this signed-in account yet.
            </p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              Create a new league in guided steps, or join an existing one with an invite link.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openCreateLeagueWizard}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                data-testid="no-league-create-button"
              >
                {createLeagueWizardOpen ? "Continue Create League" : "Create League"}
              </button>
              <div className="flex min-w-[320px] flex-1 flex-wrap gap-2">
                <input
                  type="text"
                  value={joinInviteValue}
                  onChange={(event) => setJoinInviteValue(event.target.value)}
                  className="min-w-[240px] flex-1 rounded-md border bg-transparent px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--brand-structure-muted)",
                    color: "var(--foreground)",
                  }}
                  placeholder="Paste invite link or token"
                  data-testid="no-league-join-invite-input"
                />
                <button
                  type="button"
                  onClick={handleJoinLeague}
                  className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)]"
                  style={{ color: "var(--foreground)" }}
                  data-testid="no-league-join-button"
                >
                  Join League
                </button>
              </div>
              <Link
                href="/login"
                className="rounded-md border border-[var(--brand-structure-muted)] px-4 py-2 text-sm transition hover:border-[var(--brand-structure)]"
                style={{ color: "var(--foreground)" }}
              >
                Check another email
              </Link>
              <button
                type="button"
                onClick={() => {
                  void handleSignOut();
                }}
                disabled={signingOut}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  data-testid="no-league-sign-out"
                >
                  {signingOut ? "Signing Out..." : "Sign Out"}
                </button>
              </div>
              {createLeagueWizardOpen ? (
                renderCreateLeagueWizard({
                  allowClose: false,
                  closeTestId: "league-create-wizard-close-no-league",
                })
              ) : null}
            </div>
        </section>
      ) : null}

      {!isLoading && orderedLeagues.length === 1 && !error ? (
        <section
          className="rounded-lg p-6 text-sm"
          style={{
            border: "1px solid var(--brand-structure-muted)",
            backgroundColor: "var(--brand-surface-card)",
            color: "var(--muted-foreground)",
          }}
          data-testid="league-entry-auto-redirect"
        >
          Opening {orderedLeagues[0].name}. You will be redirected automatically.
        </section>
      ) : null}

      {!isLoading && orderedLeagues.length > 1 ? (
        <section className="space-y-3" data-testid="league-directory-multi-state">
          <div
            className="rounded-lg border p-4"
            style={{
              borderColor: "var(--brand-structure-muted)",
              backgroundColor: "var(--brand-surface-card)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                Need a fresh workspace for another season or group?
              </p>
              <button
                type="button"
                onClick={openCreateLeagueWizard}
                className="rounded-md bg-[var(--brand-accent-primary)] px-4 py-2 text-sm font-medium text-[var(--brand-midnight-navy)] transition hover:bg-[var(--brand-accent-hover)]"
                data-testid="league-directory-open-create-wizard"
              >
                {createLeagueWizardOpen ? "Continue Create League" : "Create League"}
              </button>
            </div>
            {createLeagueWizardOpen ? (
              <div className="mt-4">
                {renderCreateLeagueWizard({
                  allowClose: true,
                  closeTestId: "league-create-wizard-close-directory",
                })}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2" data-testid="league-directory-grid">
            {orderedLeagues.map((league) => {
              const urgency = urgencyForPhase(league.season?.phase);
              return (
                <Link
                  key={league.id}
                  href={`/league/${league.id}`}
                  onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                    event.preventDefault();
                    void activateLeague(league, "directory");
                  }}
                  className={`rounded-lg p-4 transition ${
                    activatingLeagueId === league.id ? "opacity-75" : ""
                  }`}
                  style={{
                    border: "1px solid var(--brand-structure-muted)",
                    backgroundColor: "var(--brand-surface-elevated)",
                  }}
                  onMouseEnter={(event) => {
                    if (activatingLeagueId !== league.id) {
                      event.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.7)";
                      event.currentTarget.style.backgroundColor = "var(--brand-surface-card)";
                    }
                  }}
                  onMouseLeave={(event) => {
                    if (activatingLeagueId !== league.id) {
                      event.currentTarget.style.borderColor = "var(--brand-structure-muted)";
                      event.currentTarget.style.backgroundColor = "var(--brand-surface-elevated)";
                    }
                  }}
                  data-testid="league-directory-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3
                      className="text-base font-semibold"
                      style={{ color: "var(--foreground)" }}
                    >
                      {league.name}
                    </h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] ${urgency.className}`}>
                      {urgency.label}
                    </span>
                  </div>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {formatMembershipContext(league)}
                  </p>
                  <p
                    className="mt-2 text-sm"
                    style={{ color: "var(--foreground)" }}
                  >
                    {league.description || "No description provided for this league workspace."}
                  </p>
                  <div
                    className="mt-3 flex flex-wrap gap-2 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    <span>Season {league.season?.year ?? "-"}</span>
                    <span>Current phase: {formatLeaguePhaseLabel(league.season?.phase)}</span>
                    <span>{league.counts.teams} teams</span>
                  </div>
                  {activatingLeagueId === league.id ? (
                    <p className="mt-2 text-xs text-sky-200">Activating league workspace...</p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
