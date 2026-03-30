"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { SideNav, type SideNavSection } from "@/components/layout/side-nav";
import { TopBar, type TopBarLeagueWorkspace } from "@/components/layout/top-bar";
import { ApiRequestError, requestJson } from "@/lib/client-request";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import {
  LOGIN_ERROR_SESSION_EXPIRED,
  buildLoginPath,
  buildDevLoginPath,
  buildReturnToPath,
} from "@/lib/return-to";
import { trackUiEvent } from "@/lib/ui-analytics";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type LeagueRole = "COMMISSIONER" | "MEMBER";
type LeaguePhase = "PRESEASON" | "REGULAR_SEASON" | "PLAYOFFS" | "OFFSEASON";
type AuthMePayload = {
  user: {
    id: string;
    name: string | null;
    email: string;
    accountRole: "ADMIN" | "USER";
  };
  actor: {
    name: string | null;
    email: string;
    leagueRole: LeagueRole;
    teamId: string | null;
    teamName: string | null;
    leagueId: string;
  } | null;
  activeLeague: {
    id: string;
    name: string;
    seasonId: string;
    seasonYear: number;
  } | null;
  demoAuthEnabled: boolean;
};
type LeagueSummaryPayload = {
  league: {
    id: string;
    name: string;
  };
  season: {
    phase: LeaguePhase;
  };
};
type NotificationSummaryPayload = {
  unreadCount: number;
};
type NavLink = {
  href: string;
  label: string;
  match?: "exact" | "prefix";
};
type NavSection = {
  id: "primary" | "operations" | "oversight" | "reference";
  label: string;
  links: NavLink[];
};

function exactNavLink(href: string, label: string): NavLink {
  return { href, label, match: "exact" };
}

function prefixNavLink(href: string, label: string): NavLink {
  return { href, label, match: "prefix" };
}

function buildNavSections(
  actor: AuthMePayload["actor"] | null,
  accountRole: AuthMePayload["user"]["accountRole"] | null,
): NavSection[] {
  if (!actor) {
    const sections: NavSection[] = [
      {
        id: "primary",
        label: "League Access",
        links: [exactNavLink("/", "My Leagues")],
      },
    ];

    if (accountRole === "ADMIN") {
      sections.push({
        id: "reference",
        label: "Platform Support",
        links: [exactNavLink("/support/commissioner", "Commissioner Support")],
      });
    }

    return sections;
  }

  if (actor.leagueRole === "MEMBER" && actor.teamId) {
    return [
      {
        id: "primary",
        label: "League Member Workspace",
        links: [
          exactNavLink(`/league/${actor.leagueId}`, "Dashboard"),
          ...(actor.teamId
            ? [exactNavLink(`/teams/${actor.teamId}`, "My Roster / Cap")]
            : [prefixNavLink("/teams", "My Roster / Cap")]),
          prefixNavLink("/trades", "Trades"),
          prefixNavLink("/draft", "Picks & Draft"),
          exactNavLink("/activity", "League Activity"),
          exactNavLink("/rules", "Rules & Deadlines"),
          exactNavLink("/settings", "Settings"),
        ],
      },
    ];
  }

  if (actor.leagueRole === "MEMBER") {
    return [
      {
        id: "primary",
        label: "League Member Workspace",
        links: [
          exactNavLink(`/league/${actor.leagueId}`, "Dashboard"),
          prefixNavLink("/trades", "Trades"),
          prefixNavLink("/draft", "Picks & Draft"),
          exactNavLink("/activity", "League Activity"),
          exactNavLink("/rules", "Rules & Deadlines"),
          exactNavLink("/settings", "Settings"),
        ],
      },
      {
        id: "reference",
        label: "Reference",
        links: [
          prefixNavLink("/teams", "Teams"),
          prefixNavLink("/players", "Players"),
        ],
      },
    ];
  }

  const sections: NavSection[] = [
    {
      id: "operations",
      label: "Commissioner Operations",
      links: [
        exactNavLink("/commissioner", "Commissioner Console"),
        prefixNavLink("/commissioner/player-refresh", "Player Refresh"),
        prefixNavLink("/commissioner/audit", "Compliance Audit"),
        prefixNavLink(`/league/${actor.leagueId}/sync`, "Sync Operations"),
        exactNavLink("/commissioner/teams", "Team Administration"),
      ],
    },
    {
      id: "oversight",
      label: "League Oversight",
      links: [
        exactNavLink(`/league/${actor.leagueId}`, "League Dashboard"),
        prefixNavLink("/trades", "Trade Management"),
        prefixNavLink("/draft", "Draft Operations"),
        exactNavLink("/activity", "Activity Monitor"),
        exactNavLink("/rules", "Rules & Deadlines"),
        exactNavLink("/settings", "League Configuration"),
      ],
    },
    {
      id: "reference",
      label: "Reference & Tools",
      links: [
        prefixNavLink("/teams", "Team Rosters"),
        prefixNavLink("/players", "Player Database"),
        ...(actor.teamId
          ? [exactNavLink(`/teams/${actor.teamId}`, "My Commissioner Team")]
          : []),
      ],
    },
  ];

  if (accountRole === "ADMIN") {
    sections.push({
      id: "reference",
      label: "Platform Support",
      links: [exactNavLink("/support/commissioner", "Commissioner Support")],
    });
  }

  return sections;
}

function isActiveLink(pathname: string, link: NavLink) {
  if (link.match === "prefix") {
    return pathname === link.href || pathname.startsWith(`${link.href}/`);
  }

  return pathname === link.href;
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [actor, setActor] = useState<AuthMePayload["actor"] | null>(null);
  const [actorName, setActorName] = useState<string | null>(null);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [accountRole, setAccountRole] = useState<AuthMePayload["user"]["accountRole"] | null>(null);
  const [activeLeagueName, setActiveLeagueName] = useState<string | null>(null);
  const [availableLeagues, setAvailableLeagues] = useState<TopBarLeagueWorkspace[]>([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState("");
  const [switchingLeague, setSwitchingLeague] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [leaguePhase, setLeaguePhase] = useState<LeaguePhase | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState<number | null>(null);
  const [demoAuthEnabled, setDemoAuthEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    const leagueMatch = pathname.match(/^\/league\/([^/]+)/);
    const search = searchParams?.toString() ?? "";
    const returnTo = buildReturnToPath(pathname, search ? `?${search}` : undefined);

    function redirectToLogin() {
      window.location.assign(
        buildLoginPath({
          returnTo,
          error: LOGIN_ERROR_SESSION_EXPIRED,
        }),
      );
    }

    async function loadShellContext() {
      let contextActivationError: ApiRequestError | null = null;

      try {
        if (leagueMatch?.[1]) {
          try {
            await requestJson(
              "/api/league/context",
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                },
                body: JSON.stringify({
                  leagueId: leagueMatch[1],
                }),
              },
              "Failed to activate league context.",
            );
          } catch (error) {
            if (error instanceof ApiRequestError) {
              contextActivationError = error;
              if (error.code === "AUTH_REQUIRED") {
                redirectToLogin();
                return;
              }
            } else {
              throw error;
            }
          }
        }

        const [authPayload, leagueListPayload] = await Promise.all([
          requestJson<AuthMePayload>("/api/auth/me", { cache: "no-store" }),
          requestJson<{ leagues: TopBarLeagueWorkspace[] }>("/api/leagues", { cache: "no-store" }),
        ]);

        if (!mounted) {
          return;
        }

        const availableLeagueRows = leagueListPayload.leagues;
        const suppressActiveLeague = Boolean(leagueMatch?.[1] && contextActivationError);
        const activeLeague = suppressActiveLeague ? null : authPayload.activeLeague;
        const effectiveActor = suppressActiveLeague ? null : authPayload.actor;

        setActor(effectiveActor);
        setActorName(effectiveActor?.name ?? authPayload.user.name ?? null);
        setActorEmail(authPayload.user.email);
        setAccountRole(authPayload.user.accountRole);
        setAvailableLeagues(availableLeagueRows);
        setActiveLeagueName(activeLeague?.name ?? null);
        setSelectedLeagueId(activeLeague?.id ?? availableLeagueRows[0]?.id ?? "");
        setDemoAuthEnabled(authPayload.demoAuthEnabled);

        if (activeLeague) {
          try {
            const notificationSummaryPromise = requestJson<NotificationSummaryPayload>(
              "/api/league/dashboard/notifications?limit=3",
            ).catch(() => null);
            const [leaguePayload, notificationSummary] = await Promise.all([
              requestJson<LeagueSummaryPayload>("/api/league"),
              notificationSummaryPromise,
            ]);

            if (!mounted) {
              return;
            }

            setActiveLeagueName(leaguePayload.league.name);
            setSelectedLeagueId(leaguePayload.league.id);
            setLeaguePhase(leaguePayload.season.phase);
            setNotificationUnreadCount(notificationSummary?.unreadCount ?? 0);
          } catch (error) {
            if (!mounted) {
              return;
            }

            if (error instanceof ApiRequestError && error.code === "AUTH_REQUIRED") {
              redirectToLogin();
              return;
            }

            setActor(null);
            setActiveLeagueName(null);
            setLeaguePhase(null);
            setNotificationUnreadCount(null);

            if (pathname !== "/dashboard" && !leagueMatch?.[1]) {
              router.replace("/dashboard");
            }
          }
        } else {
          setLeaguePhase(null);
          setNotificationUnreadCount(null);
        }

        if (pathname !== "/dashboard" && !leagueMatch?.[1] && !activeLeague) {
          const canAccessWithoutLeague =
            authPayload.user.accountRole === "ADMIN" &&
            (pathname === "/settings" || pathname === "/support/commissioner");
          if (!canAccessWithoutLeague) {
            router.replace("/dashboard");
          }
        }
      } catch (error) {
        if (!mounted) {
          return;
        }

        if (error instanceof ApiRequestError && error.code === "AUTH_REQUIRED") {
          redirectToLogin();
          return;
        }

        setActor(null);
        setActorName(null);
        setActorEmail(null);
        setAccountRole(null);
        setActiveLeagueName(null);
        setAvailableLeagues([]);
        setSelectedLeagueId("");
        setLeaguePhase(null);
        setNotificationUnreadCount(null);
        setDemoAuthEnabled(false);
      }
    }

    void loadShellContext();

    return () => {
      mounted = false;
    };
  }, [pathname, router, searchParams]);

  const navSections = useMemo(() => buildNavSections(actor, accountRole), [accountRole, actor]);
  const sideNavSections = useMemo<SideNavSection[]>(
    () =>
      navSections.map((section) => ({
        id: section.id,
        label: section.label,
        links: section.links.map((link) => ({
          href: link.href,
          label: link.label,
          active: isActiveLink(pathname, link),
        })),
      })),
    [navSections, pathname],
  );
  const roleLabel =
    actor?.leagueRole === "COMMISSIONER"
      ? "Commissioner"
      : actor?.leagueRole === "MEMBER"
        ? "Member"
          : null;
  const consoleTitle =
    actor?.leagueRole === "COMMISSIONER"
      ? "Commissioner Workspace"
      : actor?.leagueRole === "MEMBER"
        ? actor.teamId
          ? "League Member Workspace"
          : "League Workspace"
          : availableLeagues.length === 0
            ? "Signed-In Workspace"
            : availableLeagues.length === 1
              ? "League Workspace"
              : "Choose a League";
  const subtitle =
    actor?.leagueRole === "MEMBER" && actor.teamName
      ? actor.teamName
      : actor
        ? "League Workspace"
        : availableLeagues.length === 0
          ? "You are signed in, but this account does not belong to a league yet."
          : availableLeagues.length === 1
            ? "Opening your league workspace."
            : "Signed in as yourself. Choose the league workspace you want to open.";
  const seasonPhaseLabel = leaguePhase ? formatLeaguePhaseLabel(leaguePhase) : null;
  const demoSwitchAccountHref = demoAuthEnabled
    ? buildDevLoginPath({
        returnTo: buildReturnToPath(pathname),
        switchSession: true,
      })
    : null;

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await requestJson(
        "/api/auth/session",
        {
          method: "DELETE",
        },
        "Could not clear the current session.",
      );

      trackUiEvent({
        eventType: PILOT_EVENT_TYPES.UI_AUTH_SESSION_RESET,
        pagePath: pathname,
        eventStep: "reset_session",
        status: "success",
        entityType: "auth_session",
        entityId: actorEmail ?? "active",
        context: {
          source: "account_panel",
        },
      });

      window.location.assign("/login");
    } catch {
      setSigningOut(false);
    }
  }

  async function switchLeagueContext() {
    if (!selectedLeagueId || selectedLeagueId === actor?.leagueId) {
      return;
    }

    const fromLeagueId = actor?.leagueId ?? null;
    setSwitchingLeague(true);

    try {
      await requestJson(
        "/api/league/context",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            leagueId: selectedLeagueId,
          }),
        },
        "Failed to switch league context.",
      );

      await requestJson(
        "/api/analytics/ui-event",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            eventType: PILOT_EVENT_TYPES.UI_LEAGUE_SWITCHED,
            pagePath: pathname,
            eventStep: "switch",
            status: "success",
            entityType: "league",
            entityId: selectedLeagueId,
            context: {
              fromLeagueId,
              toLeagueId: selectedLeagueId,
              source: actor?.leagueId ? "header_switcher" : "account_panel",
            },
          }),
        },
        "Failed to record league switch telemetry.",
      );

      window.location.assign(`/league/${selectedLeagueId}`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === "AUTH_REQUIRED") {
        window.location.assign(
          buildLoginPath({
            returnTo: buildReturnToPath(pathname),
            error: LOGIN_ERROR_SESSION_EXPIRED,
          }),
        );
        return;
      }

      setSwitchingLeague(false);
    }
  }

  return (
    <div className="shell-app" style={{ color: "var(--foreground)" }}>
      <div className="shell-frame">
        <TopBar
          consoleTitle={consoleTitle}
          activeLeagueName={activeLeagueName}
          subtitle={subtitle}
          actorName={actorName}
          actorEmail={actorEmail}
          roleLabel={roleLabel}
          seasonPhaseLabel={seasonPhaseLabel}
          notificationUnreadCount={notificationUnreadCount}
          availableLeagues={availableLeagues}
          selectedLeagueId={selectedLeagueId}
          currentLeagueId={actor?.leagueId ?? null}
          switchingLeague={switchingLeague}
          signingOut={signingOut}
          demoSwitchAccountHref={demoSwitchAccountHref}
          onSelectedLeagueIdChange={setSelectedLeagueId}
          onSwitchLeague={() => {
            void switchLeagueContext();
          }}
          onSignOut={() => {
            void handleSignOut();
          }}
        />

        <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-start">
          <SideNav
            sections={sideNavSections}
            onLinkSelect={(sectionId, link) => {
              trackUiEvent({
                eventType: PILOT_EVENT_TYPES.UI_NAV_LINK_SELECTED,
                pagePath: pathname,
                eventStep: "select",
                status: "success",
                entityType: "route",
                entityId: link.href,
                context: {
                  navSection: sectionId,
                  linkLabel: link.label,
                },
              });
            }}
          />
          <main
            className="shell-panel shell-main-panel min-w-0 flex-1 p-3 md:p-4"
            style={{
              backgroundColor: "var(--brand-surface-elevated)",
              borderColor: "var(--brand-structure-muted)",
            }}
            data-testid="shell-main-panel"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
