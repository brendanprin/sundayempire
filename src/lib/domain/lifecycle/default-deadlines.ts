import { LeaguePhase } from "@prisma/client";

export type LifecycleDeadlineSeed = {
  phase: LeaguePhase;
  deadlineType: string;
  scheduledAt: Date;
  sourceType: string;
  reminderOffsetsJson: number[];
};

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 17, 0, 0));
}

export function getDefaultLifecycleDeadlines(seasonYear: number): LifecycleDeadlineSeed[] {
  return [
    {
      phase: "PRESEASON_SETUP",
      deadlineType: "PRESEASON_SETUP_LOCK",
      scheduledAt: utcDate(seasonYear, 2, 1),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
    {
      phase: "ROOKIE_DRAFT",
      deadlineType: "ROOKIE_DRAFT_START",
      scheduledAt: utcDate(seasonYear, 5, 1),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
    {
      phase: "AUCTION_MAIN_DRAFT",
      deadlineType: "AUCTION_MAIN_DRAFT_START",
      scheduledAt: utcDate(seasonYear, 8, 1),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
    {
      phase: "REGULAR_SEASON",
      deadlineType: "REGULAR_SEASON_OPEN",
      scheduledAt: utcDate(seasonYear, 9, 1),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
    {
      phase: "PLAYOFFS",
      deadlineType: "PLAYOFFS_OPEN",
      scheduledAt: utcDate(seasonYear, 12, 1),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
    {
      phase: "OFFSEASON_ROLLOVER",
      deadlineType: "OFFSEASON_ROLLOVER_WINDOW",
      scheduledAt: utcDate(seasonYear + 1, 1, 15),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
    {
      phase: "TAG_OPTION_COMPLIANCE",
      deadlineType: "TAG_OPTION_COMPLIANCE_LOCK",
      scheduledAt: utcDate(seasonYear + 1, 3, 1),
      sourceType: "CONSTITUTION_DEFAULT",
      reminderOffsetsJson: [14, 7, 1],
    },
  ];
}
