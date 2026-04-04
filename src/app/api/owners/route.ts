import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

export async function GET(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;

  const owners = await prisma.owner.findMany({
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      _count: {
        select: { teams: true },
      },
    },
  });

  return NextResponse.json({
    owners: owners.map((owner) => ({
      id: owner.id,
      name: owner.name,
      email: owner.email,
      teamCount: owner._count.teams,
    })),
  });
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;

  const body = (await request.json()) as {
    name?: unknown;
    email?: unknown;
  };

  if (typeof body.name !== "string" || body.name.trim().length < 2) {
    return apiError(400, "INVALID_REQUEST", "Owner name must be at least 2 characters.");
  }
  if (body.email !== undefined && body.email !== null && typeof body.email !== "string") {
    return apiError(400, "INVALID_REQUEST", "Owner email must be a string when provided.");
  }

  const owner = await prisma.owner.create({
    data: {
      name: body.name.trim(),
      email: typeof body.email === "string" && body.email.trim() ? body.email.trim() : null,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    type: TransactionType.COMMISSIONER_OVERRIDE,
    summary: `Created owner ${owner.name}.`,
    metadata: {
      updatedBy: "api/owners POST",
      ownerId: owner.id,
    },
  });

  return NextResponse.json({ owner }, { status: 201 });
}
