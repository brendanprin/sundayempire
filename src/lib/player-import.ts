import { Position } from "@prisma/client";
import type { PlayerDirectoryImportEnvelope } from "@/lib/domain/player/adapters/types";
import {
  PLAYER_POSITION_ORDER,
  normalizeNflTeam,
  normalizeNullableInteger,
  normalizeNullableText,
  normalizePlayerDisplayName,
  normalizePlayerSearchName,
  normalizePlayerSourceId,
  normalizePlayerSourceKey,
  normalizePlayerStatusCode,
} from "@/lib/domain/player/normalization";

export type PlayerImportFormat = "json" | "csv";

export type PlayerImportInput = {
  sourceKey: string | null;
  sourcePlayerId: string | null;
  externalId: string | null;
  name: string;
  displayName: string;
  searchName: string;
  position: Position;
  nflTeam: string | null;
  age: number | null;
  yearsPro: number | null;
  injuryStatus: string | null;
  statusCode: string | null;
  statusText: string | null;
  isRestricted: boolean;
};

export type PlayerImportRequest = PlayerDirectoryImportEnvelope;

export type ParsedImportRows = {
  format: PlayerImportFormat;
  rawRows: Record<string, unknown>[];
  normalizedRows: PlayerImportInput[];
  errors: string[];
  requestError: string | null;
};

const VALID_POSITIONS = new Set<Position>(PLAYER_POSITION_ORDER);

export function parseImportFormat(value: unknown): PlayerImportFormat {
  if (value === "csv") {
    return "csv";
  }
  return "json";
}

function parseBooleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "n"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function readTrimmedString(
  row: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function normalizeImportRow(
  row: Record<string, unknown>,
  rowIndex: number,
): { data: PlayerImportInput | null; error: string | null } {
  const name = readTrimmedString(row, ["name"]);
  const positionRaw = readTrimmedString(row, ["position"])?.toUpperCase() ?? "";
  const displayNameInput = readTrimmedString(row, ["displayName"]);

  if (!name) {
    return {
      data: null,
      error: `Row ${rowIndex}: name is required.`,
    };
  }

  if (!VALID_POSITIONS.has(positionRaw as Position)) {
    return {
      data: null,
      error: `Row ${rowIndex}: position must be one of QB, RB, WR, TE, K, DST.`,
    };
  }

  const displayName = normalizePlayerDisplayName(displayNameInput, name);

  return {
    data: {
      sourceKey: normalizePlayerSourceKey(
        readTrimmedString(row, ["sourceKey", "provider", "providerKey", "source"]),
      ),
      sourcePlayerId: normalizePlayerSourceId(
        readTrimmedString(row, ["sourcePlayerId", "providerPlayerId", "playerSourceId"]),
      ),
      externalId: normalizePlayerSourceId(readTrimmedString(row, ["externalId"])),
      name,
      displayName,
      searchName: normalizePlayerSearchName(
        readTrimmedString(row, ["searchName"]) ?? displayName,
      ),
      position: positionRaw as Position,
      nflTeam: normalizeNflTeam(readTrimmedString(row, ["nflTeam", "team"])),
      age: normalizeNullableInteger(readTrimmedString(row, ["age"])),
      yearsPro: normalizeNullableInteger(readTrimmedString(row, ["yearsPro"])),
      injuryStatus: normalizeNullableText(readTrimmedString(row, ["injuryStatus"])),
      statusCode: normalizePlayerStatusCode(
        readTrimmedString(row, ["statusCode", "playerStatusCode"]),
      ),
      statusText: normalizeNullableText(
        readTrimmedString(row, ["statusText", "playerStatus", "status"]),
      ),
      isRestricted: parseBooleanOrDefault(row.isRestricted, false),
    },
    error: null,
  };
}

function parseCsvLine(line: string): string[] {
  return line.split(",").map((value) => value.trim());
}

export function parseCsvRows(csv: string): Record<string, unknown>[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, unknown>[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const values = parseCsvLine(lines[index]);
    const row: Record<string, unknown> = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export function parseImportRows(body: PlayerImportRequest): ParsedImportRows {
  const format = parseImportFormat(body.format);
  let rawRows: Record<string, unknown>[] = [];

  if (format === "json") {
    if (!Array.isArray(body.players)) {
      return {
        format,
        rawRows: [],
        normalizedRows: [],
        errors: [],
        requestError: "JSON import requires players as an array of rows.",
      };
    }
    rawRows = body.players.filter(
      (row): row is Record<string, unknown> => Boolean(row) && typeof row === "object",
    );
  } else {
    if (typeof body.csv !== "string") {
      return {
        format,
        rawRows: [],
        normalizedRows: [],
        errors: [],
        requestError: "CSV import requires csv string payload.",
      };
    }
    rawRows = parseCsvRows(body.csv);
  }

  if (rawRows.length === 0) {
    return {
      format,
      rawRows,
      normalizedRows: [],
      errors: [],
      requestError: "No import rows were provided.",
    };
  }

  const normalizedRows: PlayerImportInput[] = [];
  const errors: string[] = [];

  rawRows.forEach((row, index) => {
    const parsed = normalizeImportRow(row, index + 1);
    if (parsed.error) {
      errors.push(parsed.error);
      return;
    }
    if (parsed.data) {
      normalizedRows.push(parsed.data);
    }
  });

  return {
    format,
    rawRows,
    normalizedRows,
    errors,
    requestError: null,
  };
}
