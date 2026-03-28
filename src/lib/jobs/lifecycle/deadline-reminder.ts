import { PrismaClient } from "@prisma/client";

// Sprint 1 only implements deadline candidate evaluation.
// Scheduler/runner wiring is intentionally deferred to a later sprint.
export type DeadlineReminderCandidate = {
  deadlineId: string;
  leagueId: string;
  seasonId: string;
  phase: string;
  deadlineType: string;
  scheduledAt: string;
  reminderOffsetDays: number;
};

export async function evaluateDeadlineReminderCandidates(
  client: PrismaClient,
  now = new Date(),
): Promise<DeadlineReminderCandidate[]> {
  const deadlines = await client.leagueDeadline.findMany({
    where: {
      scheduledAt: {
        gte: now,
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const candidates: DeadlineReminderCandidate[] = [];

  for (const deadline of deadlines) {
    const offsets = Array.isArray(deadline.reminderOffsetsJson)
      ? deadline.reminderOffsetsJson.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [];

    for (const reminderOffsetDays of offsets) {
      const diffDays = Math.ceil((deadline.scheduledAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === reminderOffsetDays) {
        candidates.push({
          deadlineId: deadline.id,
          leagueId: deadline.leagueId,
          seasonId: deadline.seasonId,
          phase: deadline.phase,
          deadlineType: deadline.deadlineType,
          scheduledAt: deadline.scheduledAt.toISOString(),
          reminderOffsetDays,
        });
      }
    }
  }

  return candidates;
}
