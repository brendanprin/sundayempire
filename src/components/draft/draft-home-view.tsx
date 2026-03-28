"use client";

import Link from "next/link";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { PickOwnershipOperationsPanel } from "@/components/draft/pick-ownership-operations-panel";
import type { DraftHomeProjection } from "@/types/draft";

function formatStatusLabel(status: string) {
  return status.replace(/_/g, " ");
}

export function DraftHomeView(props: { draftHome: DraftHomeProjection }) {
  const rookieDraft = props.draftHome.activeRookieDraft;
  const veteranAuction = props.draftHome.activeVeteranAuction;
  const rookiePickSeasons = props.draftHome.myRookiePicks?.seasons ?? [];
  const rookiePickCount = rookiePickSeasons.reduce((total, season) => total + season.totalCount, 0);
  const canManagePickOwnership =
    props.draftHome.permissions.canManageRookieDraft ||
    props.draftHome.permissions.canManageVeteranAuction;

  return (
    <div className="space-y-6" data-testid="draft-home-view">
      <section className="rounded-2xl border border-slate-800 bg-slate-950/80 p-6">
        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Canonical workflow</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-100">Picks & Draft</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Move between rookie draft setup, veteran auction operations, and pick ownership from one
          canonical draft workspace.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Rookie Board Slots" eyebrow="Rookie draft">
          <p className="text-3xl font-semibold text-slate-100">
            {props.draftHome.setupStatus.totalBoardPicks}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Warnings: {props.draftHome.setupStatus.warningCount}
          </p>
        </DashboardCard>
        <DashboardCard title="Veteran Pool Entries" eyebrow="Veteran auction">
          <p className="text-3xl font-semibold text-slate-100">
            {props.draftHome.veteranAuctionStatus.totalPoolEntries}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Warnings: {props.draftHome.veteranAuctionStatus.warningCount}
          </p>
        </DashboardCard>
        <DashboardCard title="My Rookie Picks" eyebrow="Pick ownership">
          <p className="text-3xl font-semibold text-slate-100">{rookiePickCount}</p>
          <p className="mt-2 text-sm text-slate-400">
            {props.draftHome.myRookiePicks?.teamName ?? "No team-scoped context"}
          </p>
        </DashboardCard>
        <DashboardCard title="Commissioner Access" eyebrow="Role-aware controls">
          <p className="text-sm font-medium text-slate-100">
            {props.draftHome.permissions.canManageRookieDraft ||
            props.draftHome.permissions.canManageVeteranAuction
              ? "Commissioner draft controls available"
              : "Manager read/bid access only"}
          </p>
        </DashboardCard>
      </div>

      <section className="grid gap-4 xl:grid-cols-2" data-testid="draft-primary-workspaces">
        <Link
          href={props.draftHome.links.rookie}
          className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.25)] transition hover:border-slate-600"
          data-testid="draft-rookie-card"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Primary workspace</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-100">Rookie Draft Workspace</h3>
          <p className="mt-2 text-sm text-slate-400">
            {rookieDraft
              ? `${formatStatusLabel(rookieDraft.status)} · Pick ${rookieDraft.progress.currentPickNumber ?? "-"} of ${rookieDraft.progress.totalPicks}`
              : "Set up the generated order, correct draft slots when needed, and start the rookie room."}
          </p>
          <p className="mt-4 text-sm font-medium text-sky-200">
            {rookieDraft ? "Open Rookie Draft Workspace" : "Set Up Rookie Draft"}
          </p>
        </Link>

        <Link
          href={props.draftHome.links.veteranAuction}
          className="rounded-2xl border border-slate-800 bg-slate-950/80 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.25)] transition hover:border-slate-600"
          data-testid="draft-veteran-card"
        >
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Primary workspace</p>
          <h3 className="mt-2 text-xl font-semibold text-slate-100">Veteran Auction Workspace</h3>
          <p className="mt-2 text-sm text-slate-400">
            {veteranAuction
              ? `${formatStatusLabel(veteranAuction.draft.status)} · ${veteranAuction.poolEntryCount} pool entries · ${veteranAuction.resolvedEntryCount} resolved`
              : "Set up the veteran pool, start the auction room, and manage open bidding."}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {veteranAuction
              ? veteranAuction.blindWindowActive
                ? "Blind-bid window is active."
                : veteranAuction.auctionEndsAt
                  ? `Auction ends ${new Date(veteranAuction.auctionEndsAt).toLocaleString()}.`
                  : "Auction end time not configured."
              : "Standard and emergency fill-in modes remain available."}
          </p>
          <p className="mt-4 text-sm font-medium text-sky-200">
            {veteranAuction ? "Open Veteran Auction Workspace" : "Set Up Veteran Auction"}
          </p>
        </Link>
      </section>

      <div className="grid gap-4">
        <DashboardCard
          title="Pick ownership snapshot"
          eyebrow="Canonical summary"
          description="Use this summary to review owned rookie capital without leaving the Picks & Draft workspace. Exact draft positions appear once order is finalized."
        >
          <div className="space-y-4">
            {rookiePickSeasons.length === 0 ? (
              <p className="text-sm text-slate-500">
                {props.draftHome.myRookiePicks
                  ? "No owned rookie picks are available in the current projection window. Revisit this panel after the next pick trade or draft update."
                  : "Rookie pick ownership appears once a team context is resolved."}
              </p>
            ) : (
              rookiePickSeasons.map((season) => (
                <div key={season.seasonYear} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-medium text-slate-100">{season.seasonYear}</h4>
                    <span className="text-xs text-slate-400">{season.totalCount} picks</span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {season.rounds.map((round) => (
                      <li key={`${season.seasonYear}-${round.round}`}>
                        <span className="font-medium text-slate-200">Round {round.round}</span>
                        <span className="ml-2 text-slate-400">
                          {round.picks
                            .map((pick) => {
                              // Only show exact positions for current season picks
                              const isCurrentSeason = season.seasonYear === props.draftHome.season.year;
                              return isCurrentSeason && pick.overall 
                                ? `#${pick.overall}` 
                                : pick.originalTeamName;
                            })
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </DashboardCard>

        {canManagePickOwnership ? <PickOwnershipOperationsPanel /> : null}
      </div>
    </div>
  );
}
