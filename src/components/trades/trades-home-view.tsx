"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { TradeStatusBadge } from "@/components/trades/trade-status-badge";
import { formatEnumLabel } from "@/lib/format-label";
import { formatLeaguePhaseLabel } from "@/lib/league-phase-label";
import type { TradeHomeResponse, TradeProposalSummary } from "@/types/trade-workflow";

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not submitted";
  }

  return new Date(value).toLocaleString();
}

function SummaryCard(props: {
  label: string;
  value: number;
  scrollToId: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className="rounded-xl p-4 text-left shadow-[0_18px_60px_rgba(15,23,42,0.25)] transition-all w-full"
      style={{
        border: props.isActive
          ? "1px solid rgb(14, 165, 233)"
          : "1px solid var(--brand-structure-muted)",
        backgroundColor: props.isActive
          ? "rgba(14, 165, 233, 0.07)"
          : "var(--brand-surface-elevated)",
        cursor: "pointer",
      }}
    >
      <p
        className="text-[11px] uppercase tracking-[0.2em]"
        style={{ color: "var(--muted-foreground)" }}
      >
        Summary
      </p>
      <h3
        className="mt-1 text-base font-semibold transition-colors"
        style={{ color: props.isActive ? "rgb(125, 211, 252)" : "var(--foreground)" }}
      >
        {props.label}
      </h3>
      <p
        className="mt-4 text-3xl font-semibold"
        style={{ color: "var(--foreground)" }}
      >
        {props.value}
      </p>
    </button>
  );
}

function Section(props: {
  title: string;
  description: string;
  emptyMessage: string;
  items: TradeProposalSummary[];
  testId: string;
  id?: string;
  tier?: 1 | 2 | 3;
  eyebrow?: string;
  compact?: boolean;
  limit?: number;
  className?: string;
}) {
  const visibleItems =
    typeof props.limit === "number" ? props.items.slice(0, props.limit) : props.items;

  return (
    <DashboardCard
      title={props.title}
      description={props.description}
      eyebrow={props.eyebrow}
      testId={props.testId}
      id={props.id}
      tier={props.tier}
      className={props.className}
    >
      {props.items.length === 0 ? (
        <p 
          className="rounded-lg border border-dashed px-3 py-2 text-sm"
          style={{
            borderColor: "var(--brand-structure-muted)",
            backgroundColor: "var(--brand-surface-muted)",
            color: "var(--muted-foreground)",
          }}
        >
          {props.emptyMessage}
        </p>
      ) : (
        <ul className={props.compact ? "space-y-2" : "space-y-3"}>
          {visibleItems.map((proposal) => (
            <li
              key={proposal.id}
              className={`rounded-lg ${props.compact ? "px-3 py-2.5" : "px-4 py-3"}`}
              style={{
                border: "1px solid var(--brand-structure-muted)",
                backgroundColor: "var(--brand-surface-card)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    <Link 
                      href={`/trades/${proposal.id}`} 
                      className="transition"
                      style={{ color: "var(--foreground)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "rgb(14, 165, 233)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--foreground)";
                      }}
                    >
                      {proposal.proposerTeam.name} vs {proposal.counterpartyTeam.name}
                    </Link>
                  </p>
                  <p 
                    className="mt-1 text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {proposal.assetCount} asset{proposal.assetCount === 1 ? "" : "s"} · Updated{" "}
                    {formatDateTime(proposal.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {proposal.reviewRequired ? (
                    <span className="rounded-full border border-amber-700/50 bg-amber-950/30 px-2 py-0.5 text-xs text-amber-100">
                      Commissioner review
                    </span>
                  ) : null}
                  {proposal.hardBlocked ? (
                    <span className="rounded-full border border-rose-700/50 bg-rose-950/30 px-2 py-0.5 text-xs text-rose-100">
                      Hard blocked
                    </span>
                  ) : null}
                  <TradeStatusBadge status={proposal.status} />
                </div>
              </div>
              <div
                className={`flex flex-wrap items-center gap-4 text-xs ${props.compact ? "mt-2" : "mt-3"}`}
                style={{ color: "var(--muted-foreground)" }}
              >
                <span>Submitted {formatDateTime(proposal.submittedAt)}</span>
                <span>
                  Latest decision {proposal.currentEvaluationOutcome ?? "Not run yet"}
                </span>
                <Link 
                  href={`/trades/${proposal.id}`} 
                  className="transition"
                  style={{ color: "rgb(14, 165, 233)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "rgb(56, 189, 248)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "rgb(14, 165, 233)";
                  }}
                >
                  Review trade
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {typeof props.limit === "number" && props.items.length > props.limit ? (
        <p 
          className="mt-3 text-xs"
          style={{ color: "var(--muted-foreground)" }}
        >
          Showing {props.limit} of {props.items.length} proposals in this section.
        </p>
      ) : null}
    </DashboardCard>
  );
}

function CommissionerEmptyStateBanner(props: { allEmpty: boolean; canCreate: boolean }) {
  if (!props.allEmpty) {
    return (
      <section
        className="rounded-2xl p-5"
        style={{
          border: "1px solid var(--brand-structure-muted)",
          backgroundColor: "var(--brand-surface-elevated)",
        }}
        data-testid="trades-home-empty-state-banner"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              All trade activity is up to date
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
              No trades require commissioner review or settlement.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl p-5"
      style={{
        border: "1px solid var(--brand-structure-muted)",
        backgroundColor: "var(--brand-surface-elevated)",
      }}
      data-testid="trades-home-empty-state-banner"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            No active trades in your league
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            Trades are how teams improve their rosters. You can:
          </p>
          <ul className="mt-2 space-y-1 text-sm" style={{ color: "var(--muted-foreground)" }}>
            <li>• Create a trade proposal</li>
            <li>• Ask teams to start trade discussions</li>
          </ul>
        </div>
        {props.canCreate ? (
          <Link
            href="/trades/new"
            className="shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition"
            style={{
              border: "1px solid rgba(14, 165, 233, 0.5)",
              backgroundColor: "rgba(14, 165, 233, 0.1)",
              color: "rgb(125, 211, 252)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgb(14, 165, 233)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.5)";
            }}
          >
            Open Trade Builder
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function TradesHomeView(props: { data: TradeHomeResponse }) {
  const canCreate =
    props.data.viewer.leagueRole === "COMMISSIONER" || props.data.viewer.hasTeamAccess;
  const isCommissioner = props.data.viewer.leagueRole === "COMMISSIONER";
  const roleSummary = isCommissioner
    ? "Prioritize commissioner review, settle approved proposals, and monitor completed trade outcomes."
    : !props.data.viewer.hasTeamAccess
      ? "Review current trade state without proposal or approval controls."
      : "Respond to incoming offers, keep drafts moving, and track submitted proposals through review.";
  const priorityTitle = isCommissioner ? "Commissioner Review Queue" : "Pending Trade Actions";
  const priorityDescription = isCommissioner
    ? "Flagged proposals that need a commissioner decision before they can move forward."
    : "Submitted proposals waiting on your team to accept, decline, or review details.";
  const priorityEmpty = isCommissioner
    ? "No proposals are currently waiting on commissioner review."
    : "No proposals need your team right now.";
  const priorityItems = isCommissioner
    ? props.data.sections.reviewQueue
    : props.data.sections.requiresResponse;
  const secondaryRoleSection = isCommissioner
    ? {
        title: "Team Response Queue",
        description: "Submitted proposals still waiting on a counterparty team response.",
        emptyMessage: "No submitted proposals are currently waiting on a team response.",
        items: props.data.sections.requiresResponse,
        testId: "trades-home-response-queue",
        id: "section-secondary",
      }
    : {
        title: "Flagged for Commissioner Review",
        description: "Proposals that will route through commissioner review after submission.",
        emptyMessage: "No current proposals are flagged for commissioner review.",
        items: props.data.sections.reviewQueue,
        testId: "trades-home-review-queue",
        id: "section-secondary",
      };
  const settlementSection = isCommissioner
    ? {
        title: "Settlement Queue",
        description: "Accepted and review-approved proposals waiting for commissioner settlement.",
        emptyMessage: "No approved trade proposals are waiting to settle.",
        items: props.data.sections.settlementQueue,
        testId: "trades-home-settlement-section",
        id: "section-settlement",
      }
    : null;

  const { summary } = props.data;
  const totalTrades =
    summary.reviewQueue +
    summary.settlementQueue +
    summary.drafts +
    summary.requiresResponse +
    summary.outgoing +
    summary.closed;
  const commissionerActionsEmpty = summary.reviewQueue === 0 && summary.settlementQueue === 0;
  const showCommissionerEmptyBanner = isCommissioner && commissionerActionsEmpty;

  const summaryCards = isCommissioner
    ? [
        { label: "Commissioner Review", value: summary.reviewQueue, scrollToId: "section-priority" },
        { label: "Ready to Settle", value: summary.settlementQueue, scrollToId: "section-settlement" },
        { label: "Draft Proposals", value: summary.drafts, scrollToId: "section-drafts" },
        { label: "Requires Team Response", value: summary.requiresResponse, scrollToId: "section-secondary" },
        { label: "Closed", value: summary.closed, scrollToId: "section-closed" },
      ]
    : [
        { label: "Pending Actions", value: summary.requiresResponse, scrollToId: "section-priority" },
        { label: "Draft Proposals", value: summary.drafts, scrollToId: "section-drafts" },
        { label: "Open Proposals", value: summary.outgoing, scrollToId: "section-open" },
        { label: "Requires Team Response", value: summary.requiresResponse, scrollToId: "section-secondary" },
        { label: "Closed", value: summary.closed, scrollToId: "section-closed" },
      ];

  const [activeSection, setActiveSection] = useState<string | null>(null);

  useEffect(() => {
    const ids = summaryCards.map((c) => c.scrollToId);
    const ratios = new Map<string, number>(ids.map((id) => [id, 0]));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.intersectionRatio);
        }
        let bestId: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = id;
          }
        }
        setActiveSection(bestRatio > 0 ? bestId : null);
      },
      { threshold: Array.from({ length: 11 }, (_, i) => i / 10) },
    );

    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-6" data-testid="trades-home">
      <section 
        className="rounded-2xl p-5 shadow-[0_24px_80px_rgba(15,23,42,0.3)]"
        style={{
          border: "1px solid var(--brand-structure-muted)",
          backgroundColor: "var(--brand-surface-elevated)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p 
              className="text-[11px] uppercase tracking-[0.2em]"
              style={{ color: "var(--muted-foreground)" }}
            >
              SundayEmpire
            </p>
            <h2 
              className="mt-2 text-3xl font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              Trades
            </h2>
            <p 
              className="mt-2 text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {props.data.league.name} · {props.data.season.year} ·{" "}
              {formatLeaguePhaseLabel(props.data.season.phase)}
            </p>
            <p 
              className="mt-2 max-w-3xl text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              {roleSummary}
            </p>
          </div>
          {canCreate ? (
            <Link
              href="/trades/new"
              className="rounded-lg px-4 py-2 text-sm font-medium transition"
              style={{
                border: "1px solid rgba(14, 165, 233, 0.5)",
                backgroundColor: "rgba(14, 165, 233, 0.1)",
                color: "rgb(125, 211, 252)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgb(14, 165, 233)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(14, 165, 233, 0.5)";
              }}
            >
              Open Trade Builder
            </Link>
          ) : (
            <span 
              className="rounded-lg px-4 py-2 text-sm"
              style={{
                border: "1px solid var(--brand-structure-muted)",
                color: "var(--muted-foreground)",
              }}
            >
              Read-only trade access
            </span>
          )}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <SummaryCard
            key={card.label}
            label={card.label}
            value={card.value}
            scrollToId={card.scrollToId}
            isActive={activeSection === card.scrollToId}
            onClick={() => {
              const el = document.getElementById(card.scrollToId);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                setActiveSection(card.scrollToId);
              }
            }}
          />
        ))}
      </div>

      {showCommissionerEmptyBanner ? (
        <CommissionerEmptyStateBanner allEmpty={totalTrades === 0} canCreate={canCreate} />
      ) : null}

      {/* Tier 1: Commissioner-critical queues */}
      <div className={`grid gap-4 ${isCommissioner ? "xl:grid-cols-2" : ""}`}>
        <Section
          title={priorityTitle}
          description={priorityDescription}
          emptyMessage={priorityEmpty}
          items={priorityItems}
          testId="trades-home-priority-section"
          id="section-priority"
          tier={1}
          eyebrow={isCommissioner ? "Commissioner Action" : "Your Action"}
        />
        {isCommissioner && settlementSection ? (
          <Section
            {...settlementSection}
            tier={1}
            eyebrow="Commissioner Action"
          />
        ) : null}
      </div>

      {/* Tier 2: Active trade tracking */}
      <div className="grid gap-4 xl:grid-cols-2">
        {isCommissioner ? (
          <>
            <Section
              title="Open Trade Proposals"
              description="Submitted or recently updated proposals actively moving through the workflow."
              emptyMessage="No open proposals are currently active."
              items={props.data.sections.outgoing}
              testId="trades-home-open-section"
              id="section-open"
              tier={2}
              compact
              limit={4}
            />
            <Section
              {...secondaryRoleSection}
              tier={2}
              compact
              limit={4}
            />
          </>
        ) : (
          <>
            <Section
              {...secondaryRoleSection}
              tier={2}
              compact
              limit={4}
            />
            <Section
              title="Open Trade Proposals"
              description="Submitted or recently updated proposals actively moving through the workflow."
              emptyMessage="No open proposals are currently active."
              items={props.data.sections.outgoing}
              testId="trades-home-open-section"
              id="section-open"
              tier={2}
              compact
              limit={4}
            />
          </>
        )}
      </div>

      {/* Tier 3: Low-priority / reference */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title="Draft Proposals"
          description="Editable packages that still need validation or submission."
          emptyMessage="No draft trade proposals."
          items={props.data.sections.drafts}
          testId="trades-home-drafts-section"
          id="section-drafts"
          tier={3}
          compact
          limit={4}
        />
        <Section
          title="Recent Trade History"
          description="Closed proposals for quick context without dropping far below the active queues."
          emptyMessage="No closed trade proposals yet."
          items={props.data.sections.closed}
          testId="trades-home-history-section"
          id="section-closed"
          tier={3}
          compact
          limit={4}
        />
      </div>

    </div>
  );
}
