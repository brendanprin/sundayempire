import { TeamSlotType } from "@prisma/client";

export function parseSlotType(raw: unknown): TeamSlotType | null {
  if (typeof raw !== "string") {
    return null;
  }
  if (raw === "STARTER" || raw === "BENCH" || raw === "IR" || raw === "TAXI") {
    return raw;
  }
  return null;
}

export function buildDefaultSlotLabel(slotType: TeamSlotType, existingCount: number) {
  return `${slotType}${existingCount + 1}`;
}

export function buildNextAvailableSlotLabel(
  slotType: TeamSlotType,
  existingSlots: { id: string; slotType: TeamSlotType; slotLabel: string | null }[],
  excludeRosterSlotId?: string,
) {
  const usedLabels = new Set(
    existingSlots
      .filter((slot) => slot.slotType === slotType && slot.id !== excludeRosterSlotId)
      .map((slot) => slot.slotLabel)
      .filter((slotLabel): slotLabel is string => Boolean(slotLabel)),
  );

  let index = 1;
  while (usedLabels.has(`${slotType}${index}`)) {
    index += 1;
  }

  return `${slotType}${index}`;
}
