"use client";

import Link from "next/link";
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

function Section(props: {
  title: string;
  description: string;
  emptyMessage: string;
  items: TradeProposalSummary[];
  testId: string;
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
      testId={props.testId}
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
      }
    : {
        title: "Flagged for Commissioner Review",
        description: "Proposals that will route through commissioner review after submission.",
        emptyMessage: "No current proposals are flagged for commissioner review.",
        items: props.data.sections.reviewQueue,
        testId: "trades-home-review-queue",
      };
  const settlementSection = isCommissioner
    ? {
        title: "Settlement Queue",
        description: "Accepted and review-approved proposals waiting for commissioner settlement.",
        emptyMessage: "No approved trade proposals are waiting to settle.",
        items: props.data.sections.settlementQueue,
        testId: "trades-home-settlement-section",
      }
    : null;

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
        {(isCommissioner
          ? [
              {
                label: "Commissioner Review",
                value: props.data.summary.reviewQueue,
              },
              { label: "Ready to Settle", value: props.data.summary.settlementQueue },
              { label: "Draft Proposals", value: props.data.summary.drafts },
              { label: "Requires Team Response", value: props.data.summary.requiresResponse },
              { label: "Closed", value: props.data.summary.closed },
            ]
          : [
              {
                label: "Pending Actions",
                value: props.data.summary.requiresResponse,
              },
              { label: "Draft Proposals", value: props.data.summary.drafts },
              { label: "Open Proposals", value: props.data.summary.outgoing },
              { label: "Requires Team Response", value: props.data.summary.requiresResponse },
              { label: "Closed", value: props.data.summary.closed },
            ]).map((item) => (
          <DashboardCard key={item.label} title={item.label} eyebrow="Summary">
          <p 
            className="text-3xl font-semibold"
            style={{ color: "var(--foreground)" }}
          >
            {item.value}
          </p>
          </DashboardCard>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section
          title={priorityTitle}
          description={priorityDescription}
          emptyMessage={priorityEmpty}
          items={priorityItems}
          testId="trades-home-priority-section"
        />
        {settlementSection ? (
          <Section {...settlementSection} />
        ) : (
          <Section
            title="Draft Proposals"
            description="Editable trade packages that should be saved, validated, and submitted when ready."
            emptyMessage="No draft trade proposals."
            items={props.data.sections.drafts}
            testId="trades-home-drafts-section"
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr_0.85fr]">
        <Section
          title="Open Trade Proposals"
          description="Submitted or recently updated proposals that your team is actively moving through the workflow."
          emptyMessage="No open proposals are currently active."
          items={props.data.sections.outgoing}
          testId="trades-home-open-section"
          compact
          limit={4}
        />
        <Section
          {...secondaryRoleSection}
          compact
          limit={4}
        />
        <div className="space-y-4">
          {settlementSection ? (
            <Section
              title="Draft Proposals"
              description="Editable packages that still need validation or submission."
              emptyMessage="No draft trade proposals."
              items={props.data.sections.drafts}
              testId="trades-home-drafts-section"
              compact
              limit={3}
            />
          ) : null}

          <Section
            title="Recent Trade History"
            description="Closed proposals for quick context without dropping far below the active queues."
            emptyMessage="No closed trade proposals yet."
            items={props.data.sections.closed}
            testId="trades-home-history-section"
            compact
            limit={4}
          />
        </div>
      </div>

      {!settlementSection ? (
        <Section
          title="Draft Proposals"
          description="Editable packages that still need validation or submission."
          emptyMessage="No draft trade proposals."
          items={props.data.sections.drafts}
          testId="trades-home-drafts-section"
          compact
          limit={4}
        />
      ) : null}
    </div>
  );
}
