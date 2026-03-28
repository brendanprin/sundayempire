import { NextResponse } from "next/server";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        reason: "database_unavailable",
        checkedAt,
        detail: error instanceof Error ? error.message : "Database query failed.",
      },
      { status: 503 },
    );
  }

  const context = await getActiveLeagueContext();
  if (!context) {
    return NextResponse.json(
      {
        ok: false,
        reason: "league_context_missing",
        checkedAt,
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    ok: true,
    checkedAt,
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
  });
}

