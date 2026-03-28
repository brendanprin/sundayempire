import { parseImportRows } from "@/lib/player-import";
import {
  buildManualPlayerSourceId,
  normalizePlayerSearchName,
} from "@/lib/domain/player/normalization";
import type {
  NormalizedPlayerDirectoryRow,
  PlayerDirectoryAdapter,
  PlayerDirectoryAdapterResult,
} from "@/lib/domain/player/adapters/types";

function toDirectoryRow(
  row: ReturnType<typeof parseImportRows>["normalizedRows"][number],
): NormalizedPlayerDirectoryRow {
  const sourceKey = row.sourceKey ?? "csv-manual";
  const sourcePlayerId =
    row.sourcePlayerId ??
    row.externalId ??
    buildManualPlayerSourceId({
      displayName: row.displayName,
      position: row.position,
      nflTeam: row.nflTeam,
    });

  return {
    sourceKey,
    sourcePlayerId,
    externalId: row.externalId,
    name: row.name,
    displayName: row.displayName,
    searchName: normalizePlayerSearchName(row.searchName || row.displayName),
    position: row.position,
    nflTeam: row.nflTeam,
    age: row.age,
    yearsPro: row.yearsPro,
    injuryStatus: row.injuryStatus,
    statusCode: row.statusCode,
    statusText: row.statusText,
    isRestricted: row.isRestricted,
    raw: {
      sourceKey,
      sourcePlayerId,
      externalId: row.externalId,
      name: row.name,
      displayName: row.displayName,
      position: row.position,
      nflTeam: row.nflTeam,
      age: row.age,
      yearsPro: row.yearsPro,
      injuryStatus: row.injuryStatus,
      statusCode: row.statusCode,
      statusText: row.statusText,
      isRestricted: row.isRestricted,
    },
  };
}

export const csvManualPlayerDirectoryAdapter: PlayerDirectoryAdapter = {
  key: "csv-manual",
  label: "CSV / Manual Player Directory",

  read(input = {}): PlayerDirectoryAdapterResult {
    const parsed = parseImportRows(input.payload ?? {});
    const warnings: string[] = [];

    const rows = parsed.normalizedRows.map((row, index) => {
      if (!row.sourceKey || !row.sourcePlayerId) {
        warnings.push(
          `Player row ${index + 1}: source identity was synthesized with the csv-manual fallback.`,
        );
      }
      return toDirectoryRow(row);
    });

    return {
      adapterKey: this.key,
      sourceLabel: input.sourceLabel?.trim() || null,
      format: parsed.format,
      rawRows: parsed.rawRows,
      rows,
      errors: parsed.errors,
      warnings,
      requestError: parsed.requestError,
    };
  },
};
