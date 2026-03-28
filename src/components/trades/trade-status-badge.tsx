import type { TradeProposalSummary, TradeProposalDetailResponse } from "@/types/trade-workflow";

type TradeProposalStatus = TradeProposalSummary["status"] | TradeProposalDetailResponse["proposal"]["status"];

const STATUS_STYLE: Record<TradeProposalStatus, string> = {
  DRAFT: "border-slate-700 bg-slate-900 text-slate-200",
  SUBMITTED: "border-sky-700/50 bg-sky-950/30 text-sky-100",
  ACCEPTED: "border-emerald-700/50 bg-emerald-950/30 text-emerald-100",
  DECLINED: "border-rose-700/50 bg-rose-950/30 text-rose-100",
  REVIEW_PENDING: "border-amber-700/50 bg-amber-950/30 text-amber-100",
  REVIEW_APPROVED: "border-emerald-700/50 bg-emerald-950/30 text-emerald-100",
  REVIEW_REJECTED: "border-rose-700/50 bg-rose-950/30 text-rose-100",
  PROCESSED: "border-emerald-700/50 bg-emerald-950/30 text-emerald-100",
  CANCELED: "border-slate-700 bg-slate-900 text-slate-300",
};

function humanizeStatus(status: TradeProposalStatus) {
  return status.replace(/_/g, " ");
}

export function TradeStatusBadge(props: { status: TradeProposalStatus }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[props.status]}`}
    >
      {humanizeStatus(props.status)}
    </span>
  );
}

