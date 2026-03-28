import { Prisma, PrismaClient, TransactionType } from "@prisma/client";
import { CanonicalLeagueRole } from "@/lib/role-model";

export type TransactionLogInput = {
  leagueId: string;
  seasonId: string;
  type: TransactionType;
  summary: string;
  teamId?: string | null;
  playerId?: string | null;
  metadata?: Prisma.InputJsonValue;
  audit?: TransactionAuditInput;
};

export type TransactionDbClient = PrismaClient | Prisma.TransactionClient;

type InputJsonObject = Record<string, Prisma.InputJsonValue | null | undefined>;
type ParsedJsonObject = Record<string, unknown>;

export type TransactionActorAudit = {
  email: string | null;
  leagueRole: CanonicalLeagueRole | null;
  teamId?: string | null;
};

export type TransactionAuditInput = {
  actor?: TransactionActorAudit | null;
  source?: string;
  entities?: InputJsonObject | null;
  before?: InputJsonObject | null;
  after?: InputJsonObject | null;
};

export type TransactionAuditMetadata = {
  schemaVersion: 1;
  actor: {
    email: string | null;
    leagueRole: string | null;
    teamId: string | null;
  } | null;
  source: string | null;
  entities: ParsedJsonObject | null;
  before: ParsedJsonObject | null;
  after: ParsedJsonObject | null;
  details: Prisma.JsonValue | null;
};

function isRecord(value: unknown): value is ParsedJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactRecord(record?: InputJsonObject | null): Prisma.InputJsonObject | null {
  if (!record) return null;

  const next: Record<string, Prisma.InputJsonValue | null> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }

  return Object.keys(next).length > 0 ? (next as unknown as Prisma.InputJsonObject) : null;
}

export function buildTransactionAuditMetadata(input: {
  actor?: TransactionActorAudit | null;
  source?: string | null;
  entities?: InputJsonObject | null;
  before?: InputJsonObject | null;
  after?: InputJsonObject | null;
  details?: Prisma.InputJsonValue;
}): Prisma.InputJsonValue {
  return {
    schemaVersion: 1,
    actor: input.actor
      ? {
          email: input.actor.email ?? null,
          leagueRole: input.actor.leagueRole ?? null,
          teamId: input.actor.teamId ?? null,
        }
      : null,
    source: input.source ?? null,
    entities: compactRecord(input.entities),
    before: compactRecord(input.before),
    after: compactRecord(input.after),
    details: input.details ?? null,
  };
}

export function parseTransactionAuditMetadata(
  metadata: Prisma.JsonValue | null,
): TransactionAuditMetadata | null {
  if (!metadata || !isRecord(metadata)) {
    return null;
  }

  if (metadata.schemaVersion === 1) {
    return {
      schemaVersion: 1,
      actor: isRecord(metadata.actor)
        ? {
            email: typeof metadata.actor.email === "string" ? metadata.actor.email : null,
            leagueRole:
              typeof metadata.actor.leagueRole === "string"
                ? metadata.actor.leagueRole
                : null,
            teamId: typeof metadata.actor.teamId === "string" ? metadata.actor.teamId : null,
          }
        : null,
      source: typeof metadata.source === "string" ? metadata.source : null,
      entities: isRecord(metadata.entities) ? metadata.entities : null,
      before: isRecord(metadata.before) ? metadata.before : null,
      after: isRecord(metadata.after) ? metadata.after : null,
      details: (metadata.details as Prisma.JsonValue | undefined) ?? null,
    };
  }

  return {
    schemaVersion: 1,
    actor: null,
    source: null,
    entities: null,
    before: null,
    after: null,
    details: metadata as Prisma.JsonValue,
  };
}

export function auditActorFromRequestActor(actor: {
  email: string;
  leagueRole: CanonicalLeagueRole;
  teamId: string | null;
} | null): TransactionActorAudit {
  return {
    email: actor?.email ?? null,
    leagueRole: actor?.leagueRole ?? null,
    teamId: actor?.teamId ?? null,
  };
}

export async function logTransaction(
  db: TransactionDbClient,
  input: TransactionLogInput,
) {
  const metadata =
    input.audit !== undefined
      ? buildTransactionAuditMetadata({
          actor: input.audit.actor ?? null,
          source: input.audit.source ?? null,
          entities: input.audit.entities ?? null,
          before: input.audit.before ?? null,
          after: input.audit.after ?? null,
          details: input.metadata,
        })
      : input.metadata;

  return db.transaction.create({
    data: {
      leagueId: input.leagueId,
      seasonId: input.seasonId,
      type: input.type,
      summary: input.summary,
      teamId: input.teamId ?? null,
      playerId: input.playerId ?? null,
      metadata,
    },
  });
}
