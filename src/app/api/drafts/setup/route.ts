import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { requireLeagueRole } from "@/lib/auth";
import { createAuctionPoolService } from "@/lib/domain/auction/auction-pool-service";
import {
  buildDefaultVeteranAuctionTitle,
  parseAuctionDate,
  parseOptionalPositiveInteger,
} from "@/lib/domain/auction/shared";
import { buildDefaultRookieDraftTitle } from "@/lib/domain/draft/shared";
import { createRookieDraftOrderService } from "@/lib/domain/draft/rookie-draft-order-service";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { createAuctionSetupProjection } from "@/lib/read-models/auction/auction-setup-projection";
import { createDraftSetupProjection } from "@/lib/read-models/draft/draft-setup-projection";
import { logTransaction } from "@/lib/transactions";
import {
  DraftSetupRequest,
  DraftSetupResponse,
  VeteranAuctionSetupResponse,
} from "@/types/draft";
import { isDraftType } from "@/types/draft";

function parseRequestedId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseRequestedTitle(value: unknown, seasonYear: number, requestedType: "ROOKIE" | "VETERAN_AUCTION") {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return requestedType === "VETERAN_AUCTION"
    ? buildDefaultVeteranAuctionTitle(seasonYear)
    : buildDefaultRookieDraftTitle(seasonYear);
}

function parseRequestedType(value: unknown): "ROOKIE" | "VETERAN_AUCTION" {
  if (isDraftType(value) && (value === "ROOKIE" || value === "VETERAN_AUCTION")) {
    return value;
  }

  return "ROOKIE";
}

function parseRequestedBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      return true;
    }
    if (normalized === "false" || normalized === "0" || normalized === "no") {
      return false;
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, [
    "COMMISSIONER", "MEMBER",
  ]);
  if (auth.response) {
    return auth.response;
  }
  if (!auth.actor) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }
  const actor = auth.actor;
  const requestedType = parseRequestedType(request.nextUrl.searchParams.get("type"));

  if (requestedType === "VETERAN_AUCTION") {
    const projection = await createAuctionSetupProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actorRole: actor.leagueRole,
      search: request.nextUrl.searchParams.get("search"),
    });

    if (!projection) {
      return apiError(404, "AUCTION_SETUP_NOT_FOUND", "Veteran auction setup context could not be resolved.");
    }

    const response: VeteranAuctionSetupResponse = {
      setup: projection,
    };

    return NextResponse.json(response);
  }

  const projection = await createDraftSetupProjection(prisma).read({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actorRole: actor.leagueRole,
  });

  if (!projection) {
    return apiError(404, "DRAFT_SETUP_NOT_FOUND", "Rookie draft setup context could not be resolved.");
  }

  const response: DraftSetupResponse = {
    setup: projection,
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }

  const context = access.context;
  const actor = access.actor;

  const body = (await request.json().catch(() => ({}))) as DraftSetupRequest;
  const requestedType = parseRequestedType(body.type);
  const requestedDraftId = parseRequestedId(body.draftId);
  const requestedTitle = parseRequestedTitle(body.title, context.seasonYear, requestedType);
  const regenerate = parseRequestedBoolean(body.regenerate);
  const finalizePool = parseRequestedBoolean(body.finalizePool);

  if (requestedType === "VETERAN_AUCTION") {
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const poolService = createAuctionPoolService(tx);
          const draft = finalizePool
            ? await tx.draft.findFirst({
                where: requestedDraftId
                  ? {
                      id: requestedDraftId,
                      leagueId: context.leagueId,
                      seasonId: context.seasonId,
                      type: "VETERAN_AUCTION",
                    }
                  : {
                      leagueId: context.leagueId,
                      seasonId: context.seasonId,
                      type: "VETERAN_AUCTION",
                      status: {
                        in: ["NOT_STARTED", "IN_PROGRESS"],
                      },
                    },
                orderBy: requestedDraftId ? undefined : [{ updatedAt: "desc" }, { createdAt: "desc" }],
              })
            : await poolService.ensureAuctionDraft({
                leagueId: context.leagueId,
                seasonId: context.seasonId,
                seasonYear: context.seasonYear,
                draftId: requestedDraftId,
                title: requestedTitle,
                auctionMode: body.auctionMode,
                auctionEndsAt: parseAuctionDate(body.auctionEndsAt),
                auctionOpenBidWindowSeconds: parseOptionalPositiveInteger(
                  body.auctionOpenBidWindowSeconds,
                  60,
                ),
                auctionBidResetSeconds: parseOptionalPositiveInteger(body.auctionBidResetSeconds, 30),
              });

          if (!draft) {
            throw new Error("DRAFT_NOT_FOUND");
          }

          if (finalizePool) {
            await poolService.finalizePool({
              draftId: draft.id,
              leagueId: context.leagueId,
              seasonId: context.seasonId,
              finalizedByUserId: actor.userId,
            });

            await logTransaction(tx, {
              leagueId: context.leagueId,
              seasonId: context.seasonId,
              type: TransactionType.COMMISSIONER_OVERRIDE,
              summary: `Finalized veteran auction pool for "${draft.title}".`,
              metadata: {
                draftId: draft.id,
                draftType: draft.type,
                updatedBy: "api/drafts/setup POST",
              },
            });
          } else {
            const state = await poolService.generatePool({
              draftId: draft.id,
              leagueId: context.leagueId,
              seasonId: context.seasonId,
              createdByUserId: actor.userId,
              regenerate,
              selectedPlayerIds: body.selectedPlayerIds,
            });

            await logTransaction(tx, {
              leagueId: context.leagueId,
              seasonId: context.seasonId,
              type: TransactionType.COMMISSIONER_OVERRIDE,
              summary: `${regenerate ? "Regenerated" : "Generated"} veteran auction pool for "${draft.title}".`,
              metadata: {
                draftId: draft.id,
                draftType: draft.type,
                auctionMode: draft.auctionMode,
                poolCount: state.createdCount,
                excludedCount: state.excludedCount,
                warningCount: state.warnings.length,
                updatedBy: "api/drafts/setup POST",
              },
            });
          }

          return {
            draftId: draft.id,
          };
        },
        { timeout: 15_000 },
      );

      const projection = await createAuctionSetupProjection(prisma).read({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        draftId: result.draftId,
        actorRole: actor.leagueRole,
      });

      if (!projection) {
        return apiError(404, "AUCTION_SETUP_NOT_FOUND", "Veteran auction setup context could not be resolved.");
      }

      const response: VeteranAuctionSetupResponse = {
        setup: projection,
      };

      return NextResponse.json(response, { status: requestedDraftId ? 200 : 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "AUCTION_SETUP_FAILED";
      if (message === "DRAFT_NOT_FOUND") {
        return apiError(404, "DRAFT_NOT_FOUND", "Veteran auction was not found in the active season.");
      }
      if (message === "DRAFT_STATE_CONFLICT") {
        return apiError(
          409,
          "DRAFT_STATE_CONFLICT",
          "Veteran auction pool can only be regenerated before the auction starts and before bids or awards exist.",
        );
      }
      if (message === "AUCTION_POOL_FINALIZED") {
        return apiError(
          409,
          "AUCTION_POOL_FINALIZED",
          "Finalize locks the auction pool. Use an explicit recovery workflow before changing it again.",
        );
      }
      if (message === "AUCTION_POOL_RECOVERY_REQUIRED") {
        return apiError(
          409,
          "AUCTION_POOL_RECOVERY_REQUIRED",
          "Live bids, awards, or an active auction block regeneration. Use an explicit recovery workflow before rewriting the pool.",
        );
      }
      if (message === "AUCTION_POOL_NOT_READY") {
        return apiError(
          409,
          "AUCTION_POOL_NOT_READY",
          "Generate and review at least one eligible pool entry before finalizing the veteran auction pool.",
        );
      }
      if (message === "EMERGENCY_POOL_REQUIRED") {
        return apiError(
          400,
          "EMERGENCY_POOL_REQUIRED",
          "Emergency fill-in mode requires at least one eligible player to seed the pool.",
        );
      }

      return apiError(409, "AUCTION_SETUP_FAILED", "Veteran auction setup could not be completed.");
    }
  }

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        let created = false;
        let draft = requestedDraftId
          ? await tx.draft.findFirst({
              where: {
                id: requestedDraftId,
                leagueId: context.leagueId,
                seasonId: context.seasonId,
                type: "ROOKIE",
              },
            })
          : await tx.draft.findFirst({
              where: {
                leagueId: context.leagueId,
                seasonId: context.seasonId,
                type: "ROOKIE",
                status: {
                  in: ["NOT_STARTED", "IN_PROGRESS"],
                },
              },
              orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
            });

        if (!draft) {
          draft = await tx.draft.create({
            data: {
              leagueId: context.leagueId,
              seasonId: context.seasonId,
              type: "ROOKIE",
              title: requestedTitle,
              status: "NOT_STARTED",
              currentPickIndex: 0,
            },
          });
          created = true;

          await logTransaction(tx, {
            leagueId: context.leagueId,
            seasonId: context.seasonId,
            type: TransactionType.COMMISSIONER_OVERRIDE,
            summary: `Created rookie draft session "${draft.title}".`,
            metadata: {
              draftId: draft.id,
              draftType: draft.type,
              draftStatus: draft.status,
              updatedBy: "api/drafts/setup POST",
            },
          });
        }

        const state = await createRookieDraftOrderService(tx).ensureDraftBoard({
          draftId: draft.id,
          regenerate,
          createdByUserId: actor.userId,
        });

        await logTransaction(tx, {
          leagueId: context.leagueId,
          seasonId: context.seasonId,
          type: TransactionType.COMMISSIONER_OVERRIDE,
          summary: `${regenerate ? "Regenerated" : "Generated"} rookie draft board for "${draft.title}".`,
          metadata: {
            draftId: draft.id,
            regenerate,
            warningCount: state.warnings.length,
            estimatedOrderUsed: state.estimatedOrderUsed,
            updatedBy: "api/drafts/setup POST",
          },
        });

        return {
          draftId: draft.id,
          created,
        };
      },
      { timeout: 15_000 },
    );

    const projection = await createDraftSetupProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId: result.draftId,
      actorRole: actor.leagueRole,
    });

    if (!projection) {
      return apiError(404, "DRAFT_SETUP_NOT_FOUND", "Rookie draft setup context could not be resolved.");
    }

    const response: DraftSetupResponse = {
      setup: projection,
    };

    return NextResponse.json(response, { status: result.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "DRAFT_SETUP_FAILED";
    if (message === "DRAFT_NOT_FOUND") {
      return apiError(404, "DRAFT_NOT_FOUND", "Rookie draft was not found in the active season.");
    }
    if (message === "DRAFT_STATE_CONFLICT") {
      return apiError(
        409,
        "DRAFT_STATE_CONFLICT",
        "Rookie draft board can only be regenerated before the draft starts and before selections exist.",
      );
    }

    return apiError(409, "DRAFT_SETUP_FAILED", "Rookie draft setup could not be completed.");
  }
}
