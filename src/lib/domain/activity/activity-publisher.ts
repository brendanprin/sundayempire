import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createActivityEventRepository } from "@/lib/repositories/activity/activity-event-repository";
import type {
  ActivityRepositoriesDbClient,
  CreateActivityEventInput,
} from "@/lib/repositories/activity/types";
import { logRuntime } from "@/lib/runtime-log";

function toLoggableError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

function isDedupeConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("dedupeKey")
  );
}

export function createActivityPublisher(
  client: ActivityRepositoriesDbClient = prisma,
  dependencies?: {
    repository?: Pick<
      ReturnType<typeof createActivityEventRepository>,
      "create" | "findByDedupeKey"
    >;
  },
) {
  const repository = dependencies?.repository ?? createActivityEventRepository(client);

  const publish = async (input: CreateActivityEventInput) => {
    if (input.dedupeKey) {
      const existing = await repository.findByDedupeKey(input.dedupeKey);
      if (existing) {
        return existing;
      }
    }

    try {
      return await repository.create(input);
    } catch (error) {
      if (input.dedupeKey && isDedupeConflict(error)) {
        const existing = await repository.findByDedupeKey(input.dedupeKey);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  };

  const publishSafe = async (input: CreateActivityEventInput) => {
    try {
      return await publish(input);
    } catch (error) {
      logRuntime("warn", {
        event: "activity_event.write_failed",
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        eventType: input.eventType,
        sourceEntityType: input.sourceEntityType ?? null,
        sourceEntityId: input.sourceEntityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
        ...toLoggableError(error),
      });
      return null;
    }
  };

  return {
    publish,
    publishSafe,
  };
}
