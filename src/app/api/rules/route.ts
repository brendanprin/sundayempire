import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { requireLeagueRole } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";
import { RulesApiPayload, RulesetEditableFields } from "@/types/rules";

const EDITABLE_RULE_FIELDS: Array<keyof RulesetEditableFields> = [
  "notes",
  "rosterSize",
  "starterQb",
  "starterQbFlex",
  "starterRb",
  "starterWr",
  "starterTe",
  "starterFlex",
  "starterDst",
  "irSlots",
  "salaryCapSoft",
  "salaryCapHard",
  "waiverBidMaxAtOrAboveSoftCap",
  "minContractYears",
  "maxContractYears",
  "minSalary",
  "maxContractYearsIfSalaryBelowTen",
  "rookieBaseYears",
  "rookieOptionYears",
  "franchiseTagsPerTeam",
  "tradeDeadlineWeek",
  "regularSeasonWeeks",
  "playoffStartWeek",
  "playoffEndWeek",
];

function normalizeRuleset(raw: Record<string, unknown>): Partial<RulesetEditableFields> {
  const normalized: Partial<RulesetEditableFields> = {};

  for (const key of EDITABLE_RULE_FIELDS) {
    const value = raw[key];

    if (key === "notes") {
      if (value === undefined) continue;
      if (value === null || value === "") {
        normalized.notes = null;
        continue;
      }
      if (typeof value !== "string") {
        throw new Error("notes must be a string or null.");
      }
      normalized.notes = value.trim() || null;
      continue;
    }

    if (value === undefined) continue;
    const numericValue = Number(value);
    if (!Number.isInteger(numericValue)) {
      throw new Error(`${key} must be an integer.`);
    }
    normalized[key] = numericValue as never;
  }

  return normalized;
}

function validateRuleset(input: RulesetEditableFields) {
  if (input.rosterSize < 1) return "rosterSize must be at least 1.";
  if (input.salaryCapSoft < 0) return "salaryCapSoft must be 0 or greater.";
  if (input.salaryCapHard < input.salaryCapSoft) return "salaryCapHard must be greater than or equal to salaryCapSoft.";
  if (input.minSalary < 0) return "minSalary must be 0 or greater.";
  if (input.minContractYears < 1) return "minContractYears must be at least 1.";
  if (input.maxContractYears < input.minContractYears) return "maxContractYears must be greater than or equal to minContractYears.";
  if (input.maxContractYearsIfSalaryBelowTen < input.minContractYears) {
    return "maxContractYearsIfSalaryBelowTen must be greater than or equal to minContractYears.";
  }
  if (input.rookieBaseYears < 0 || input.rookieOptionYears < 0) {
    return "rookie contract year values must be 0 or greater.";
  }
  if (input.tradeDeadlineWeek < 1) return "tradeDeadlineWeek must be at least 1.";
  if (input.regularSeasonWeeks < 1) return "regularSeasonWeeks must be at least 1.";
  if (input.playoffStartWeek < 1 || input.playoffEndWeek < input.playoffStartWeek) {
    return "playoff weeks must define a valid increasing range.";
  }

  return null;
}

function buildRulesPayload(ruleset: Awaited<ReturnType<typeof prisma.leagueRuleSet.findUniqueOrThrow>>, history: RulesApiPayload["history"]): RulesApiPayload {
  return {
    ruleset: {
      id: ruleset.id,
      leagueId: ruleset.leagueId,
      isActive: ruleset.isActive,
      version: ruleset.version,
      effectiveAt: ruleset.effectiveAt.toISOString(),
      createdAt: ruleset.createdAt.toISOString(),
      updatedAt: ruleset.updatedAt.toISOString(),
      notes: ruleset.notes,
      rosterSize: ruleset.rosterSize,
      starterQb: ruleset.starterQb,
      starterQbFlex: ruleset.starterQbFlex,
      starterRb: ruleset.starterRb,
      starterWr: ruleset.starterWr,
      starterTe: ruleset.starterTe,
      starterFlex: ruleset.starterFlex,
      starterDst: ruleset.starterDst,
      irSlots: ruleset.irSlots,
      salaryCapSoft: ruleset.salaryCapSoft,
      salaryCapHard: ruleset.salaryCapHard,
      waiverBidMaxAtOrAboveSoftCap: ruleset.waiverBidMaxAtOrAboveSoftCap,
      minContractYears: ruleset.minContractYears,
      maxContractYears: ruleset.maxContractYears,
      minSalary: ruleset.minSalary,
      maxContractYearsIfSalaryBelowTen: ruleset.maxContractYearsIfSalaryBelowTen,
      rookieBaseYears: ruleset.rookieBaseYears,
      rookieOptionYears: ruleset.rookieOptionYears,
      franchiseTagsPerTeam: ruleset.franchiseTagsPerTeam,
      tradeDeadlineWeek: ruleset.tradeDeadlineWeek,
      regularSeasonWeeks: ruleset.regularSeasonWeeks,
      playoffStartWeek: ruleset.playoffStartWeek,
      playoffEndWeek: ruleset.playoffEndWeek,
    },
    history,
  };
}

async function loadRulesPayload(leagueId: string, activeRulesetId?: string) {
  const rulesets = await prisma.leagueRuleSet.findMany({
    where: { leagueId },
    orderBy: [{ version: "desc" }],
    take: 6,
  });

  const activeRuleset = rulesets.find((ruleset) => ruleset.id === activeRulesetId) ?? rulesets[0];
  if (!activeRuleset) {
    return null;
  }

  return buildRulesPayload(
    activeRuleset,
    rulesets.map((ruleset) => ({
      id: ruleset.id,
      version: ruleset.version,
      isActive: ruleset.isActive,
      effectiveAt: ruleset.effectiveAt.toISOString(),
      createdAt: ruleset.createdAt.toISOString(),
      notes: ruleset.notes,
    })),
  );
}

export async function GET() {
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const payload = await loadRulesPayload(context.leagueId, context.ruleset.id);
  if (!payload) {
    return apiError(404, "RULESET_NOT_FOUND", "No active ruleset was found.");
  }

  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;

  let normalizedPatch: Partial<RulesetEditableFields>;
  try {
    normalizedPatch = normalizeRuleset((await request.json()) as Record<string, unknown>);
  } catch (error) {
    return apiError(
      400,
      "INVALID_REQUEST",
      error instanceof Error ? error.message : "Ruleset payload is invalid.",
    );
  }

  if (Object.keys(normalizedPatch).length === 0) {
    return apiError(400, "INVALID_REQUEST", "At least one ruleset field is required.");
  }

  const nextRuleset: RulesetEditableFields = {
    notes: context.ruleset.notes,
    rosterSize: context.ruleset.rosterSize,
    starterQb: context.ruleset.starterQb,
    starterQbFlex: context.ruleset.starterQbFlex,
    starterRb: context.ruleset.starterRb,
    starterWr: context.ruleset.starterWr,
    starterTe: context.ruleset.starterTe,
    starterFlex: context.ruleset.starterFlex,
    starterDst: context.ruleset.starterDst,
    irSlots: context.ruleset.irSlots,
    salaryCapSoft: context.ruleset.salaryCapSoft,
    salaryCapHard: context.ruleset.salaryCapHard,
    waiverBidMaxAtOrAboveSoftCap: context.ruleset.waiverBidMaxAtOrAboveSoftCap,
    minContractYears: context.ruleset.minContractYears,
    maxContractYears: context.ruleset.maxContractYears,
    minSalary: context.ruleset.minSalary,
    maxContractYearsIfSalaryBelowTen: context.ruleset.maxContractYearsIfSalaryBelowTen,
    rookieBaseYears: context.ruleset.rookieBaseYears,
    rookieOptionYears: context.ruleset.rookieOptionYears,
    franchiseTagsPerTeam: context.ruleset.franchiseTagsPerTeam,
    tradeDeadlineWeek: context.ruleset.tradeDeadlineWeek,
    regularSeasonWeeks: context.ruleset.regularSeasonWeeks,
    playoffStartWeek: context.ruleset.playoffStartWeek,
    playoffEndWeek: context.ruleset.playoffEndWeek,
    ...normalizedPatch,
  };

  const validationError = validateRuleset(nextRuleset);
  if (validationError) {
    return apiError(400, "RULESET_VALIDATION_ERROR", validationError);
  }

  const changedKeys = EDITABLE_RULE_FIELDS.filter(
    (key) => context.ruleset[key] !== nextRuleset[key],
  );
  if (changedKeys.length === 0) {
    const payload = await loadRulesPayload(context.leagueId, context.ruleset.id);
    return NextResponse.json(payload);
  }

  const created = await prisma.$transaction(async (tx) => {
    await tx.leagueRuleSet.updateMany({
      where: {
        leagueId: context.leagueId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    const nextVersion = context.ruleset.version + 1;
    const ruleset = await tx.leagueRuleSet.create({
      data: {
        leagueId: context.leagueId,
        version: nextVersion,
        isActive: true,
        ...nextRuleset,
      },
    });

    await logTransaction(tx, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: `Activated ruleset version ${nextVersion}.`,
      metadata: {
        updatedBy: "api/rules PATCH",
        previousRulesetId: context.ruleset.id,
        nextRulesetId: ruleset.id,
        previousVersion: context.ruleset.version,
        nextVersion,
        changedKeys,
      },
    });

    return ruleset;
  });

  const payload = await loadRulesPayload(context.leagueId, created.id);
  return NextResponse.json(payload);
}
