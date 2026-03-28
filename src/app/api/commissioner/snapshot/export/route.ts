import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getActiveLeagueContext } from "@/lib/league-context";
import { parseBooleanParam } from "@/lib/request";
import { buildLeagueSnapshot, summarizeSnapshotCounts } from "@/lib/snapshot";

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();

  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const pretty = parseBooleanParam(request.nextUrl.searchParams.get("pretty")) ?? false;
  const snapshot = await buildLeagueSnapshot(context);
  const counts = summarizeSnapshotCounts(snapshot.data);

  if (pretty) {
    return new Response(JSON.stringify({ snapshot, counts }, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
      },
    });
  }

  return NextResponse.json({
    snapshot,
    counts,
  });
}
