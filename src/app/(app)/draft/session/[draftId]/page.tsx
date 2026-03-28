import { redirect } from "next/navigation";
import { createActorContextService } from "@/lib/application/actor-context/service";
import { getAuthenticatedUser } from "@/lib/auth";
import { routeSegmentForDraftType } from "@/lib/draft-type-config";
import { getLeagueContextById } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export default async function DraftSessionRedirectPage(routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect(`/login?returnTo=${encodeURIComponent(`/draft/session/${draftId}`)}`);
  }

  const draft = await prisma.draft.findUnique({
    where: {
      id: draftId,
    },
    select: {
      id: true,
      type: true,
      leagueId: true,
      seasonId: true,
    },
  });

  if (!draft) {
    redirect("/draft");
  }

  const [actor, context] = await Promise.all([
    createActorContextService(prisma).resolveActorForUserId(user.id, draft.leagueId),
    getLeagueContextById(draft.leagueId),
  ]);
  if (!actor || !context || draft.seasonId !== context.seasonId) {
    redirect("/draft");
  }

  if (draft.type === "STARTUP") {
    redirect(`/draft?startup=retired&session=${encodeURIComponent(draft.id)}`);
  }

  const routeSegment = routeSegmentForDraftType(draft.type);
  if (!routeSegment) {
    redirect("/draft");
  }

  redirect(`/draft/${routeSegment}?session=${encodeURIComponent(draft.id)}`);
}
