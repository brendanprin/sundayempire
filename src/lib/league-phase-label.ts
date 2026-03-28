import { formatEnumLabel } from "@/lib/format-label";

export function formatLeaguePhaseLabel(phase: string | null | undefined) {
  if (!phase) {
    return "Not configured";
  }

  if (phase === "PRESEASON" || phase === "PRESEASON_SETUP") {
    return "Preseason";
  }

  if (phase === "ROOKIE_DRAFT") {
    return "Rookie Draft";
  }

  if (phase === "AUCTION_MAIN_DRAFT") {
    return "Veteran Auction";
  }

  if (phase === "REGULAR_SEASON") {
    return "Regular Season";
  }

  if (phase === "PLAYOFFS") {
    return "Playoffs";
  }

  if (phase === "TAG_OPTION_COMPLIANCE") {
    return "Tag and Option Review";
  }

  if (phase === "OFFSEASON" || phase === "OFFSEASON_ROLLOVER") {
    return "Offseason";
  }

  return formatEnumLabel(phase);
}
