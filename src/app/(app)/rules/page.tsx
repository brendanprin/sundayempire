"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { RulesDeadlinesView } from "@/components/rules/rules-deadlines-view";
import type { FormState, RulesFieldGroup } from "@/components/rules/rules-form-types";
import { requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type { RulesDeadlinesProjection } from "@/types/detail";
import { RulesApiPayload, RulesetEditableFields } from "@/types/rules";

const FIELD_GROUPS: RulesFieldGroup[] = [
  {
    title: "Roster And Lineup",
    fields: [
      { key: "notes", label: "Notes", type: "text" },
      { key: "rosterSize", label: "Roster Size" },
      { key: "starterQb", label: "Starter QB" },
      { key: "starterQbFlex", label: "Starter QB Flex" },
      { key: "starterRb", label: "Starter RB" },
      { key: "starterWr", label: "Starter WR" },
      { key: "starterTe", label: "Starter TE" },
      { key: "starterFlex", label: "Starter Flex" },
      { key: "starterDst", label: "Starter DST" },
      { key: "irSlots", label: "IR Slots" },
    ],
  },
  {
    title: "Cap And Contracts",
    fields: [
      { key: "salaryCapSoft", label: "Soft Cap" },
      { key: "salaryCapHard", label: "Hard Cap" },
      { key: "waiverBidMaxAtOrAboveSoftCap", label: "Max Waiver Bid At/Above Soft Cap" },
      { key: "minSalary", label: "Min Salary" },
      { key: "minContractYears", label: "Min Contract Years" },
      { key: "maxContractYears", label: "Max Contract Years" },
      { key: "maxContractYearsIfSalaryBelowTen", label: "Max Years Below $10" },
      { key: "rookieBaseYears", label: "Rookie Base Years" },
      { key: "rookieOptionYears", label: "Rookie Option Years" },
      { key: "franchiseTagsPerTeam", label: "Franchise Tags Per Team" },
    ],
  },
  {
    title: "Schedule And Trade Window",
    fields: [
      { key: "tradeDeadlineWeek", label: "Trade Deadline Week" },
      { key: "regularSeasonWeeks", label: "Regular Season Weeks" },
      { key: "playoffStartWeek", label: "Playoff Start Week" },
      { key: "playoffEndWeek", label: "Playoff End Week" },
    ],
  },
];

type AuthMePayload = {
  actor: {
    leagueRole: "COMMISSIONER" | "MEMBER";
  };
};

function toFormState(ruleset: RulesDeadlinesProjection["ruleset"]): FormState | null {
  if (!ruleset) {
    return null;
  }

  return {
    notes: ruleset.notes ?? "",
    rosterSize: String(ruleset.rosterSize),
    starterQb: String(ruleset.starterQb),
    starterQbFlex: String(ruleset.starterQbFlex),
    starterRb: String(ruleset.starterRb),
    starterWr: String(ruleset.starterWr),
    starterTe: String(ruleset.starterTe),
    starterFlex: String(ruleset.starterFlex),
    starterDst: String(ruleset.starterDst),
    irSlots: String(ruleset.irSlots),
    salaryCapSoft: String(ruleset.salaryCapSoft),
    salaryCapHard: String(ruleset.salaryCapHard),
    waiverBidMaxAtOrAboveSoftCap: String(ruleset.waiverBidMaxAtOrAboveSoftCap),
    minContractYears: String(ruleset.minContractYears),
    maxContractYears: String(ruleset.maxContractYears),
    minSalary: String(ruleset.minSalary),
    maxContractYearsIfSalaryBelowTen: String(ruleset.maxContractYearsIfSalaryBelowTen),
    rookieBaseYears: String(ruleset.rookieBaseYears),
    rookieOptionYears: String(ruleset.rookieOptionYears),
    franchiseTagsPerTeam: String(ruleset.franchiseTagsPerTeam),
    tradeDeadlineWeek: String(ruleset.tradeDeadlineWeek),
    regularSeasonWeeks: String(ruleset.regularSeasonWeeks),
    playoffStartWeek: String(ruleset.playoffStartWeek),
    playoffEndWeek: String(ruleset.playoffEndWeek),
  };
}

function toPatchPayload(form: FormState): RulesetEditableFields {
  return {
    notes: form.notes || null,
    rosterSize: Number(form.rosterSize),
    starterQb: Number(form.starterQb),
    starterQbFlex: Number(form.starterQbFlex),
    starterRb: Number(form.starterRb),
    starterWr: Number(form.starterWr),
    starterTe: Number(form.starterTe),
    starterFlex: Number(form.starterFlex),
    starterDst: Number(form.starterDst),
    irSlots: Number(form.irSlots),
    salaryCapSoft: Number(form.salaryCapSoft),
    salaryCapHard: Number(form.salaryCapHard),
    waiverBidMaxAtOrAboveSoftCap: Number(form.waiverBidMaxAtOrAboveSoftCap),
    minContractYears: Number(form.minContractYears),
    maxContractYears: Number(form.maxContractYears),
    minSalary: Number(form.minSalary),
    maxContractYearsIfSalaryBelowTen: Number(form.maxContractYearsIfSalaryBelowTen),
    rookieBaseYears: Number(form.rookieBaseYears),
    rookieOptionYears: Number(form.rookieOptionYears),
    franchiseTagsPerTeam: Number(form.franchiseTagsPerTeam),
    tradeDeadlineWeek: Number(form.tradeDeadlineWeek),
    regularSeasonWeeks: Number(form.regularSeasonWeeks),
    playoffStartWeek: Number(form.playoffStartWeek),
    playoffEndWeek: Number(form.playoffEndWeek),
  };
}

export default function RulesPage() {
  const [detail, setDetail] = useState<RulesDeadlinesProjection | null>(null);
  const [actor, setActor] = useState<AuthMePayload["actor"] | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    const [detailPayload, authPayload] = await Promise.all([
      requestJson<RulesDeadlinesProjection>("/api/rules/detail", undefined, "Failed to load rules detail."),
      requestJson<AuthMePayload>("/api/auth/me", undefined, "Failed to load viewer context."),
    ]);

    setDetail(detailPayload);
    setActor(authPayload.actor);
    setForm(toFormState(detailPayload.ruleset));
  }, []);

  useEffect(() => {
    let mounted = true;

    loadDetail()
      .then(() => {
        if (mounted) {
          setError(null);
        }
      })
      .catch((requestError) => {
        if (!mounted) {
          return;
        }
        setError(requestError instanceof Error ? requestError.message : "Failed to load rules detail.");
      });

    return () => {
      mounted = false;
    };
  }, [loadDetail]);

  const saveRules = useCallback(async () => {
    if (!form) {
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<RulesApiPayload>(
        "/api/rules",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(toPatchPayload(form)),
        },
        "Failed to save rules.",
      );

      await loadDetail();
      setMessage(`Ruleset v${payload.ruleset.version} is now active.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save rules.");
    } finally {
      setBusy(false);
    }
  }, [form, loadDetail]);

  if (error && !detail) {
    return (
      <div className="space-y-6">
        <PageHeaderBand
          eyebrow="League Guide"
          title="Rules & Deadlines"
          description="Current league phase, upcoming deadlines, and rules that affect your decisions."
          titleTestId="rules-title"
          eyebrowTestId="rules-eyebrow"
        />
        <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">
          Rules & Deadlines could not load. {error} Existing league rules and deadline records are unchanged. 
          Refresh to retry, or return after league context is restored.
        </div>
      </div>
    );
  }

  if (!detail || !actor) {
    return (
      <div className="space-y-6">
        <PageHeaderBand
          eyebrow="League Guide"
          title="Rules & Deadlines"
          description="Current league phase, upcoming deadlines, and rules that affect your decisions."
          titleTestId="rules-title"
          eyebrowTestId="rules-eyebrow"
        />
        <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 px-4 py-3 text-sm text-slate-300">
          Loading current phase, deadlines, and rule details. 
          Existing rules and league data remain unchanged while this page loads.
        </div>
      </div>
    );
  }

  const headerDescription = `${detail.league.name}${detail.league.description ? ` • ${detail.league.description}` : ""} • Current phase, upcoming deadlines, and rule details for your league decisions.`;

  return (
    <div className="space-y-6">
      <PageHeaderBand
        eyebrow="League Guide"
        title="Rules & Deadlines"
        description={headerDescription}
        titleTestId="rules-title"
        eyebrowTestId="rules-eyebrow"
      />
      
      <RulesDeadlinesView
        detail={detail}
        fieldGroups={FIELD_GROUPS}
        form={form}
        canEdit={actor.leagueRole === "COMMISSIONER"}
        busy={busy}
        error={error}
        message={message}
        onFormChange={(field, value) =>
          setForm((previous) => (previous ? { ...previous, [field]: value } : previous))
        }
        onSave={saveRules}
      />
    </div>
  );
}
