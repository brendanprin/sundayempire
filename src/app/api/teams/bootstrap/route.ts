import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createLeagueInviteService, deriveLeagueInviteStatus } from "@/lib/domain/auth/LeagueInviteService";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { logTransaction } from "@/lib/transactions";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REQUIRED_HEADERS = [
  "ownername",
  "owneremail",
  "teamname",
];

type BootstrapMode = "validate" | "apply";

type ParsedTemplateRow = {
  rowNumber: number;
  ownerName: string;
  ownerEmail: string;
  teamName: string;
  teamAbbreviation: string | null;
  divisionLabel: string | null;
};

type RowValidation = {
  rowNumber: number;
  status: "valid" | "invalid";
  errors: string[];
  row: ParsedTemplateRow;
};

class TeamBootstrapError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "TeamBootstrapError";
    this.status = status;
    this.code = code;
  }
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new TeamBootstrapError(400, "INVALID_REQUEST", "CSV parsing failed: unmatched quote.");
  }

  values.push(current.trim());
  return values;
}

function parseTemplateCsv(csvText: string) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new TeamBootstrapError(
      400,
      "INVALID_REQUEST",
      "Template must include headers and at least one data row.",
    );
  }

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  for (const requiredHeader of REQUIRED_HEADERS) {
    if (!headers.includes(requiredHeader)) {
      throw new TeamBootstrapError(
        400,
        "INVALID_REQUEST",
        `Template header "${requiredHeader}" is required.`,
      );
    }
  }

  const ownerNameIndex = headers.indexOf("ownername");
  const ownerEmailIndex = headers.indexOf("owneremail");
  const teamNameIndex = headers.indexOf("teamname");
  const teamAbbreviationIndex = headers.indexOf("teamabbreviation");
  const divisionLabelIndex = headers.indexOf("divisionlabel");

  const rows: ParsedTemplateRow[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    rows.push({
      rowNumber: index + 1,
      ownerName: (values[ownerNameIndex] ?? "").trim(),
      ownerEmail: (values[ownerEmailIndex] ?? "").trim().toLowerCase(),
      teamName: (values[teamNameIndex] ?? "").trim(),
      teamAbbreviation:
        teamAbbreviationIndex >= 0
          ? normalizeOptionalText(values[teamAbbreviationIndex] ?? "")?.toUpperCase() ?? null
          : null,
      divisionLabel:
        divisionLabelIndex >= 0
          ? normalizeOptionalText(values[divisionLabelIndex] ?? "")
          : null,
    });
  }

  return rows;
}

async function validateTemplateRows(input: {
  leagueId: string;
  rows: ParsedTemplateRow[];
}) {
  const { leagueId, rows } = input;
  const teamNameCounts = new Map<string, number>();
  const teamAbbreviationCounts = new Map<string, number>();
  const ownerEmailCounts = new Map<string, number>();

  for (const row of rows) {
    const normalizedName = row.teamName.toLowerCase();
    teamNameCounts.set(normalizedName, (teamNameCounts.get(normalizedName) ?? 0) + 1);
    ownerEmailCounts.set(row.ownerEmail, (ownerEmailCounts.get(row.ownerEmail) ?? 0) + 1);
    if (row.teamAbbreviation) {
      teamAbbreviationCounts.set(
        row.teamAbbreviation,
        (teamAbbreviationCounts.get(row.teamAbbreviation) ?? 0) + 1,
      );
    }
  }

  const existingTeams = await prisma.team.findMany({
    where: { leagueId },
    select: {
      name: true,
      abbreviation: true,
    },
  });

  const existingTeamNames = new Set(existingTeams.map((team) => team.name.toLowerCase()));
  const existingTeamAbbreviations = new Set(
    existingTeams
      .map((team) => team.abbreviation?.toUpperCase())
      .filter((abbreviation): abbreviation is string => Boolean(abbreviation)),
  );

  const emails = [...new Set(rows.map((row) => row.ownerEmail).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: emails,
      },
    },
    select: {
      id: true,
      email: true,
    },
  });
  const userByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));

  const memberships = await prisma.leagueMembership.findMany({
    where: {
      leagueId,
      userId: {
        in: users.map((user) => user.id),
      },
    },
    select: {
      userId: true,
    },
  });
  const usersWithMembership = new Set(memberships.map((membership) => membership.userId));

  const inviteService = createLeagueInviteService(prisma);
  const pendingInviteLeagueByEmail = new Map<string, string | null>();
  await Promise.all(
    emails.map(async (email) => {
      const pendingInvite = await inviteService.findLatestPendingInviteByEmail(email);
      pendingInviteLeagueByEmail.set(email, pendingInvite?.leagueId ?? null);
    }),
  );

  const results: RowValidation[] = rows.map((row) => {
    const errors: string[] = [];

    if (row.ownerName.trim().length < 2) {
      errors.push("Owner name must be at least 2 characters.");
    }
    if (!EMAIL_PATTERN.test(row.ownerEmail)) {
      errors.push("Owner email must be a valid email address.");
    }
    if (row.teamName.trim().length < 2) {
      errors.push("Team name must be at least 2 characters.");
    }
    if (row.teamAbbreviation && row.teamAbbreviation.length > 8) {
      errors.push("Team abbreviation must be 8 characters or fewer.");
    }

    if (teamNameCounts.get(row.teamName.toLowerCase()) && (teamNameCounts.get(row.teamName.toLowerCase()) ?? 0) > 1) {
      errors.push("Template contains duplicate team names.");
    }
    if (
      row.teamAbbreviation &&
      (teamAbbreviationCounts.get(row.teamAbbreviation) ?? 0) > 1
    ) {
      errors.push("Template contains duplicate team abbreviations.");
    }
    if ((ownerEmailCounts.get(row.ownerEmail) ?? 0) > 1) {
      errors.push("Template contains duplicate owner emails.");
    }

    if (existingTeamNames.has(row.teamName.toLowerCase())) {
      errors.push("Team name already exists in this league.");
    }
    if (row.teamAbbreviation && existingTeamAbbreviations.has(row.teamAbbreviation)) {
      errors.push("Team abbreviation already exists in this league.");
    }

    const invitedUserId = userByEmail.get(row.ownerEmail) ?? null;
    if (invitedUserId && usersWithMembership.has(invitedUserId)) {
      errors.push("Owner email already has league membership access.");
    }

    if (pendingInviteLeagueByEmail.get(row.ownerEmail) === leagueId) {
      errors.push("A pending invite already exists for this owner email.");
    }

    return {
      rowNumber: row.rowNumber,
      status: errors.length === 0 ? "valid" : "invalid",
      errors,
      row,
    };
  });

  const validCount = results.filter((result) => result.status === "valid").length;
  const invalidCount = results.length - validCount;

  return {
    results,
    summary: {
      totalRows: results.length,
      validRows: validCount,
      invalidRows: invalidCount,
    },
  };
}

async function applyValidatedRow(input: {
  leagueId: string;
  seasonId: string;
  seasonYear: number;
  actorUserId: string;
  origin: string;
  row: ParsedTemplateRow;
}) {
  const { leagueId, seasonId, seasonYear, actorUserId, origin, row } = input;
  const ownerEmail = row.ownerEmail.toLowerCase();
  const teamAbbreviation = row.teamAbbreviation ? row.teamAbbreviation.toUpperCase() : null;

  const duplicateTeam = await prisma.team.findFirst({
    where: {
      leagueId,
      OR: [{ name: row.teamName }, ...(teamAbbreviation ? [{ abbreviation: teamAbbreviation }] : [])],
    },
    select: {
      id: true,
    },
  });
  if (duplicateTeam) {
    throw new TeamBootstrapError(409, "TEAM_ALREADY_EXISTS", "Team already exists in this league.");
  }

  const invitedUser = await prisma.user.findUnique({
    where: {
      email: ownerEmail,
    },
    select: {
      id: true,
      email: true,
    },
  });

  if (invitedUser) {
    const membership = await prisma.leagueMembership.findUnique({
      where: {
        userId_leagueId: {
          userId: invitedUser.id,
          leagueId,
        },
      },
      select: {
        id: true,
      },
    });
    if (membership) {
      throw new TeamBootstrapError(
        409,
        "INVITE_CONFLICT",
        "Owner email already has membership access in this league.",
      );
    }
  }

  const pendingInvite = await createLeagueInviteService(prisma).findLatestPendingInviteByEmail(ownerEmail);
  if (pendingInvite?.leagueId === leagueId) {
    throw new TeamBootstrapError(
      409,
      "INVITE_CONFLICT",
      "A pending invite already exists for this owner email.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const ownerRecord = await tx.owner.findFirst({
      where: {
        email: ownerEmail,
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (ownerRecord?.userId && invitedUser && ownerRecord.userId !== invitedUser.id) {
      throw new TeamBootstrapError(
        409,
        "INVITE_CONFLICT",
        "Owner record is already linked to a different account.",
      );
    }

    const owner = ownerRecord
      ? await tx.owner.update({
          where: {
            id: ownerRecord.id,
          },
          data: {
            name: row.ownerName,
            email: ownerEmail,
          },
          select: {
            id: true,
          },
        })
      : await tx.owner.create({
          data: {
            name: row.ownerName,
            email: ownerEmail,
          },
          select: {
            id: true,
          },
        });

    const team = await tx.team.create({
      data: {
        leagueId,
        ownerId: owner.id,
        name: row.teamName,
        abbreviation: teamAbbreviation,
        divisionLabel: row.divisionLabel,
      },
      select: {
        id: true,
        name: true,
      },
    });

    const pickRows: {
      leagueId: string;
      seasonYear: number;
      round: number;
      overall: number;
      originalTeamId: string;
      currentTeamId: string;
      isUsed: boolean;
    }[] = [];

    for (let seasonOffset = 0; seasonOffset < 3; seasonOffset += 1) {
      const targetSeasonYear = seasonYear + seasonOffset;
      for (let round = 1; round <= 2; round += 1) {
        const maxOverall = await tx.futurePick.aggregate({
          where: {
            leagueId,
            seasonYear: targetSeasonYear,
            round,
          },
          _max: {
            overall: true,
          },
        });

        pickRows.push({
          leagueId,
          seasonYear: targetSeasonYear,
          round,
          overall: (maxOverall._max.overall ?? 0) + 1,
          originalTeamId: team.id,
          currentTeamId: team.id,
          isUsed: false,
        });
      }
    }

    await tx.futurePick.createMany({
      data: pickRows,
    });

    const invite = await createLeagueInviteService(tx).createInvite({
      leagueId,
      email: ownerEmail,
      intendedRole: "MEMBER",
      teamId: team.id,
      ownerId: owner.id,
      invitedByUserId: actorUserId,
      origin,
    });

    await logTransaction(tx, {
      leagueId,
      seasonId,
      teamId: team.id,
      type: TransactionType.COMMISSIONER_OVERRIDE,
        summary: `Bulk bootstrap created ${team.name} and invited ${ownerEmail}.`,
        metadata: {
          updatedBy: "api/teams/bootstrap POST",
          workflow: "TEAM_BOOTSTRAP_IMPORT",
          inviteId: invite.invite.id,
          deliveryState: invite.deliveryView.state,
        },
      });

    return {
      teamId: team.id,
      teamName: team.name,
      inviteId: invite.invite.id,
      inviteStatus: deriveLeagueInviteStatus(invite.invite, new Date()),
    };
  });
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const json = await parseJsonBody<{ mode?: unknown; csvText?: unknown }>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : "";
  const normalizedMode: BootstrapMode | null =
    mode === "validate" || mode === "apply" ? mode : null;
  if (!normalizedMode) {
    return apiError(400, "INVALID_REQUEST", "mode must be one of: validate, apply.");
  }

  if (typeof body.csvText !== "string" || body.csvText.trim().length === 0) {
    return apiError(400, "INVALID_REQUEST", "csvText is required.");
  }

  try {
    const parsedRows = parseTemplateCsv(body.csvText);
    const validation = await validateTemplateRows({
      leagueId: access.context.leagueId,
      rows: parsedRows,
    });

    if (normalizedMode === "validate") {
      return NextResponse.json({
        mode: normalizedMode,
        summary: validation.summary,
        rows: validation.results,
      });
    }

    const applyResults: Array<{
      rowNumber: number;
      status: "created" | "failed";
      message: string;
      teamId: string | null;
      inviteId: string | null;
    }> = validation.results
      .filter((row) => row.status === "invalid")
      .map((row) => ({
        rowNumber: row.rowNumber,
        status: "failed",
        message: row.errors.join(" "),
        teamId: null,
        inviteId: null,
      }));

    for (const rowResult of validation.results) {
      if (rowResult.status === "invalid") {
        continue;
      }

      try {
        const applied = await applyValidatedRow({
          leagueId: access.context.leagueId,
          seasonId: access.context.seasonId,
          seasonYear: access.context.seasonYear,
          actorUserId: access.actor.userId,
          origin: request.nextUrl.origin,
          row: rowResult.row,
        });

        applyResults.push({
          rowNumber: rowResult.rowNumber,
          status: "created",
          message: `Created ${applied.teamName} and issued invite.`,
          teamId: applied.teamId,
          inviteId: applied.inviteId,
        });
      } catch (error) {
        if (error instanceof TeamBootstrapError) {
          applyResults.push({
            rowNumber: rowResult.rowNumber,
            status: "failed",
            message: error.message,
            teamId: null,
            inviteId: null,
          });
        } else {
          applyResults.push({
            rowNumber: rowResult.rowNumber,
            status: "failed",
            message: error instanceof Error ? error.message : "Unexpected apply failure.",
            teamId: null,
            inviteId: null,
          });
        }
      }
    }

    const createdCount = applyResults.filter((result) => result.status === "created").length;
    const failedCount = applyResults.length - createdCount;

    return NextResponse.json({
      mode: normalizedMode,
      summary: {
        totalRows: validation.summary.totalRows,
        validRows: validation.summary.validRows,
        invalidRows: validation.summary.invalidRows,
        createdRows: createdCount,
        failedRows: failedCount,
      },
      rows: validation.results,
      applyResults,
    });
  } catch (error) {
    if (error instanceof TeamBootstrapError) {
      return apiError(error.status, error.code, error.message);
    }
    return apiError(400, "INVALID_REQUEST", error instanceof Error ? error.message : "Invalid template.");
  }
}
