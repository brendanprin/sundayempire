import { TeamMembershipType } from "@prisma/client";
import { AccountRole, CanonicalLeagueRole } from "@/lib/role-model";

export type TeamMembershipResolutionSource =
  | "TEAM_MEMBERSHIP"
  | "LEAGUE_MEMBERSHIP"
  | "COMMISSIONER_NO_TEAM";

export type ResolvedActorContext = {
  userId: string;
  email: string;
  name: string | null;
  leagueId: string;
  accountRole: AccountRole;
  leagueRole: CanonicalLeagueRole;
  teamId: string | null;
  teamName: string | null;
  teamMembershipType: TeamMembershipType | null;
  resolutionSource: TeamMembershipResolutionSource;
};
