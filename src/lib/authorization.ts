import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ACTIVE_LEAGUE_COOKIE, HEADER_LEAGUE_ID, type AuthActor, requireLeagueRole } from "@/lib/auth";
import {
  getLeagueContextById,
  listAccessibleLeagueContextsForUser,
  type LeagueContext,
} from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { getAuthenticatedUser } from "./auth";
import { AcceptedLeagueRole } from "./role-model";

type AcceptedRole = AcceptedLeagueRole;

type GuardFailure = {
  actor: null;
  context: null;
  response: NextResponse;
};

type ActiveLeagueGuardSuccess = {
  actor: AuthActor;
  context: LeagueContext;
  response: null;
};

type ResourceLeagueGuardSuccess<TResource> = {
  actor: AuthActor;
  context: LeagueContext;
  resource: TResource;
  response: null;
};

type ResourceNotFoundOptions = {
  code: string;
  message: string;
};

function getRequestedLeagueId(request: NextRequest) {
  return (
    request.headers.get(HEADER_LEAGUE_ID)?.trim() ||
    request.cookies.get(ACTIVE_LEAGUE_COOKIE)?.value?.trim() ||
    null
  );
}

export async function requireCurrentLeagueRole(
  request: NextRequest,
  roles: AcceptedRole[],
): Promise<ActiveLeagueGuardSuccess | GuardFailure> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      actor: null,
      context: null,
      response: apiError(401, "AUTH_REQUIRED", "Authentication is required."),
    };
  }

  const requestedLeagueId = getRequestedLeagueId(request);
  const accessibleContexts = await listAccessibleLeagueContextsForUser(user.id);

  if (accessibleContexts.length === 0) {
    return {
      actor: null,
      context: null,
      response: apiError(403, "FORBIDDEN", "You do not have membership access to any league workspace."),
    };
  }

  const context = requestedLeagueId
    ? accessibleContexts.find((candidate) => candidate.leagueId === requestedLeagueId) ?? null
    : accessibleContexts[0] ?? null;

  if (!context) {
    return {
      actor: null,
      context: null,
      response: apiError(
        403,
        "FORBIDDEN",
        "You do not have membership access to the requested league workspace.",
      ),
    };
  }

  const auth = await requireLeagueRole(request, context.leagueId, roles);
  if (auth.response || !auth.actor) {
    return {
      actor: null,
      context: null,
      response:
        auth.response ?? apiError(403, "FORBIDDEN", "You do not have permission for this action."),
    };
  }

  return {
    actor: auth.actor,
    context,
    response: null,
  };
}

export async function requireResourceLeagueRole<TResource extends { leagueId: string }>(
  request: NextRequest,
  loadResource: () => Promise<TResource | null>,
  roles: AcceptedRole[],
  notFound: ResourceNotFoundOptions,
): Promise<ResourceLeagueGuardSuccess<TResource> | GuardFailure> {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return {
      actor: null,
      context: null,
      response: apiError(401, "AUTH_REQUIRED", "Authentication is required."),
    };
  }

  const resource = await loadResource();
  if (!resource) {
    return {
      actor: null,
      context: null,
      response: apiError(404, notFound.code, notFound.message),
    };
  }

  const auth = await requireLeagueRole(request, resource.leagueId, roles);
  if (auth.response || !auth.actor) {
    return {
      actor: null,
      context: null,
      response:
        auth.response ?? apiError(403, "FORBIDDEN", "You do not have permission for this action."),
    };
  }

  const context = await getLeagueContextById(resource.leagueId);
  if (!context) {
    return {
      actor: null,
      context: null,
      response: apiError(
        409,
        "LEAGUE_CONTEXT_NOT_READY",
        "Requested league does not have an active season/ruleset context.",
        {
          leagueId: resource.leagueId,
        },
      ),
    };
  }

  return {
    actor: auth.actor,
    context,
    resource,
    response: null,
  };
}

export async function requireDraftLeagueRole(
  request: NextRequest,
  draftId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.draft.findUnique({
        where: { id: draftId },
        select: {
          id: true,
          leagueId: true,
          seasonId: true,
        },
      }),
    roles,
    {
      code: "DRAFT_NOT_FOUND",
      message: "Draft was not found.",
    },
  );
}

export async function requireLeagueInviteRole(
  request: NextRequest,
  inviteId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.leagueInvite.findUnique({
        where: { id: inviteId },
        select: {
          id: true,
          leagueId: true,
        },
      }),
    roles,
    {
      code: "INVITE_NOT_FOUND",
      message: "Invite was not found.",
    },
  );
}

export async function requireTradeProposalLeagueRole(
  request: NextRequest,
  proposalId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.tradeProposal.findUnique({
        where: { id: proposalId },
        select: {
          id: true,
          leagueId: true,
          seasonId: true,
        },
      }),
    roles,
    {
      code: "TRADE_NOT_FOUND",
      message: "Trade proposal was not found.",
    },
  );
}

export async function requireTradeLeagueRole(
  request: NextRequest,
  tradeId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.trade.findUnique({
        where: { id: tradeId },
        select: {
          id: true,
          leagueId: true,
          seasonId: true,
        },
      }),
    roles,
    {
      code: "TRADE_NOT_FOUND",
      message: "Trade was not found.",
    },
  );
}

export async function requireContractLeagueRole(
  request: NextRequest,
  contractId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.contract.findUnique({
        where: { id: contractId },
        select: {
          id: true,
          seasonId: true,
          team: {
            select: {
              leagueId: true,
            },
          },
        },
      }).then((contract) =>
        contract
          ? {
              ...contract,
              leagueId: contract.team.leagueId,
            }
          : null,
      ),
    roles,
    {
      code: "CONTRACT_NOT_FOUND",
      message: "Contract was not found.",
    },
  );
}

export async function requireTeamLeagueRole(
  request: NextRequest,
  teamId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.team.findUnique({
        where: { id: teamId },
        select: {
          id: true,
          leagueId: true,
        },
      }),
    roles,
    {
      code: "TEAM_NOT_FOUND",
      message: "Team was not found.",
    },
  );
}

export async function requirePickLeagueRole(
  request: NextRequest,
  pickId: string,
  roles: AcceptedRole[],
) {
  return requireResourceLeagueRole(
    request,
    () =>
      prisma.futurePick.findUnique({
        where: { id: pickId },
        select: {
          id: true,
          leagueId: true,
        },
      }),
    roles,
    {
      code: "PICK_NOT_FOUND",
      message: "Pick was not found.",
    },
  );
}
