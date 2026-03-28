import { NextRequest, NextResponse } from "next/server";
import { TransactionType } from "@prisma/client";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

type RouteContext = {
  params: Promise<{
    ownerId: string;
  }>;
};

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;

  const { ownerId } = await routeContext.params;
  const existingOwner = await prisma.owner.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true },
  });

  if (!existingOwner) {
    return apiError(404, "OWNER_NOT_FOUND", "Owner was not found.");
  }

  const body = (await request.json()) as {
    name?: unknown;
    email?: unknown;
  };

  const patch: { name?: string; email?: string | null } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length < 2) {
      return apiError(400, "INVALID_REQUEST", "Owner name must be at least 2 characters.");
    }
    patch.name = body.name.trim();
  }

  if (body.email !== undefined) {
    if (body.email !== null && typeof body.email !== "string") {
      return apiError(400, "INVALID_REQUEST", "Owner email must be a string or null.");
    }
    patch.email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;
  }

  if (Object.keys(patch).length === 0) {
    return apiError(400, "INVALID_REQUEST", "At least one field is required.");
  }

  const owner = await prisma.owner.update({
    where: { id: ownerId },
    data: patch,
    select: { id: true, name: true, email: true },
  });

  await logTransaction(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    type: TransactionType.COMMISSIONER_OVERRIDE,
    summary: `Updated owner ${owner.name}.`,
    metadata: {
      updatedBy: "api/owners/[ownerId] PATCH",
      ownerId,
      before: existingOwner,
      after: owner,
    },
  });

  return NextResponse.json({ owner });
}
