import { LeaguePhase, LeagueRole } from "@prisma/client";
import { errorResult, okResult } from "@/lib/application/result";

export type RosterWriteAction =
  | "move"
  | "add"
  | "drop"
  | "swap"
  | "cut"
  | "move_to_starter"
  | "move_to_bench"
  | "move_to_ir";

export function evaluateRosterWritePolicy(input: {
  phase: LeaguePhase;
  actorRole: LeagueRole;
  action: RosterWriteAction;
}) {
  if (input.phase === "REGULAR_SEASON") {
    return errorResult(
      "ROSTER_WRITE_BLOCKED_REGULAR_SEASON",
      "Direct roster writes are mirror-only during the regular season.",
      409,
      {
        phase: input.phase,
        actorRole: input.actorRole,
        action: input.action,
      },
    );
  }

  return okResult({
    allowed: true,
  });
}
