import type { ContractImpactPreview, PlayerContractDetailProjection } from "@/types/detail";

type ViewerRole = "COMMISSIONER" | "MEMBER";
type PreviewActionId = ContractImpactPreview["action"];

function previewStatusCopy(
  preview: ContractImpactPreview | null,
  action: PreviewActionId,
) {
  if (!preview || preview.action !== action) {
    return null;
  }

  if (preview.legal) {
    return "Latest preview completed successfully. Review the impact panel before acting.";
  }

  return preview.blockedReason ?? "Latest preview is blocked by current league rules.";
}

function previewStatusTone(
  preview: ContractImpactPreview | null,
  action: PreviewActionId,
) {
  if (!preview || preview.action !== action) {
    return null;
  }

  return preview.legal ? "success" : "blocked";
}

function ActionAvailabilityCard(props: {
  title: string;
  description: string;
  buttonLabel: string;
  available: boolean;
  blockedReason: string | null;
  latestPreviewCopy: string | null;
  latestPreviewTone: "success" | "blocked" | null;
  tone?: "neutral" | "warning" | "info";
  onClick: (() => void) | null;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4" data-testid={props.testId}>
      <div className="space-y-3">
        {/* Action Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-100">{props.title}</h4>
            <p className="mt-1 text-sm text-slate-400">{props.description}</p>
          </div>
          <div className={`rounded-full px-2 py-1 text-xs font-medium ${
            props.available 
              ? "bg-green-950/40 border border-green-700/50 text-green-200"
              : "bg-red-950/40 border border-red-700/50 text-red-200"
          }`}>
            {props.available ? "Available" : "Blocked"}
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          disabled={!props.available}
          onClick={() => props.onClick?.()}
          className={`w-full rounded-md border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            props.tone === "warning"
              ? "border-amber-700 bg-amber-950/20 text-amber-100 hover:bg-amber-950/40"
              : props.tone === "info"
                ? "border-sky-700 bg-sky-950/20 text-sky-100 hover:bg-sky-950/40"
                : "border-slate-700 bg-slate-950/20 text-slate-100 hover:bg-slate-950/40"
          }`}
        >
          {props.buttonLabel}
        </button>

        {/* Blocker Explanation */}
        {props.blockedReason ? (
          <div className="rounded-md border border-amber-700/40 bg-amber-950/20 px-3 py-2">
            <p className="text-xs text-amber-100">
              <span className="font-medium">Blocked:</span> {props.blockedReason}
            </p>
          </div>
        ) : null}

        {/* Latest Preview Status */}
        {props.latestPreviewCopy ? (
          <div className={`rounded-md border px-3 py-2 ${
            props.latestPreviewTone === "blocked"
              ? "border-red-700/40 bg-red-950/20"
              : "border-emerald-700/40 bg-emerald-950/20"
          }`}>
            <p className={`text-xs ${
              props.latestPreviewTone === "blocked" ? "text-red-100" : "text-emerald-100"
            }`}>
              <span className="font-medium">
                {props.latestPreviewTone === "blocked" ? "Preview blocked:" : "Preview ready:"}
              </span>{" "}
              {props.latestPreviewCopy}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PlayerActionAvailability(props: {
  detail: PlayerContractDetailProjection;
  viewerRole: ViewerRole;
  viewerTeamId: string | null;
  preview: ContractImpactPreview | null;
  onPreviewCut: (teamId: string, playerId: string) => void;
  onPreviewFranchiseTag: (contractId: string) => void;
  onPreviewRookieOption: (contractId: string) => void;
  testId?: string;
}) {
  const previewTeamId = props.detail.contract?.team.id ?? props.detail.rosterContext?.team.id ?? null;
  const canPreview =
    props.viewerRole === "COMMISSIONER" ||
    (props.viewerRole === "MEMBER" && previewTeamId !== null && props.viewerTeamId === previewTeamId);
  const currentContract = props.detail.contract;

  // Determine action availability and blocking reasons
  const cutBlockedReason = !canPreview
    ? "Cut previews are limited to commissioners and members assigned to the team."
    : !previewTeamId
      ? "A cut preview requires an owning team context for this player."
      : null;

  const franchiseTagBlockedReason = !canPreview
    ? "Franchise-tag previews are limited to commissioners and members assigned to the team."
    : !currentContract
      ? "No current contract is available for a franchise-tag preview."
      : currentContract.isFranchiseTag
        ? "This player is already on a franchise tag."
        : null;

  const rookieOptionBlockedReason = !canPreview
    ? "Rookie-option previews are limited to commissioners and members assigned to the team."
    : !currentContract
      ? "No current contract is available for a rookie-option preview."
      : !currentContract.rookieOptionEligible
        ? "This contract is not rookie-option eligible."
        : currentContract.rookieOptionExercised
          ? "The rookie option has already been exercised."
          : null;

  return (
    <div className="shell-panel" data-testid={props.testId}>
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-100">Action Availability</h3>
        <p className="mt-1 text-sm text-slate-400">
          Preview contract decisions before making any changes. All actions require proper permissions and league rule compliance.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ActionAvailabilityCard
          title="Cut Decision"
          description="Release player and inspect cap/compliance impact"
          buttonLabel="Preview Cut Impact"
          available={!cutBlockedReason}
          blockedReason={cutBlockedReason}
          latestPreviewCopy={previewStatusCopy(props.preview, "cut")}
          latestPreviewTone={previewStatusTone(props.preview, "cut")}
          onClick={
            !cutBlockedReason && previewTeamId
              ? () => props.onPreviewCut(previewTeamId, props.detail.player.id)
              : null
          }
          testId="action-cut-preview"
        />

        <ActionAvailabilityCard
          title="Franchise Tag"
          description="Apply franchise tag and review salary impact"
          buttonLabel="Preview Tag Impact"
          available={!franchiseTagBlockedReason}
          blockedReason={franchiseTagBlockedReason}
          latestPreviewCopy={previewStatusCopy(props.preview, "franchise_tag")}
          latestPreviewTone={previewStatusTone(props.preview, "franchise_tag")}
          tone="warning"
          onClick={
            !franchiseTagBlockedReason && currentContract
              ? () => props.onPreviewFranchiseTag(currentContract.id)
              : null
          }
          testId="action-franchise-tag-preview"
        />

        <ActionAvailabilityCard
          title="Rookie Option"
          description="Exercise option and inspect multi-year impact"
          buttonLabel="Preview Option Impact"
          available={!rookieOptionBlockedReason}
          blockedReason={rookieOptionBlockedReason}
          latestPreviewCopy={previewStatusCopy(props.preview, "rookie_option")}
          latestPreviewTone={previewStatusTone(props.preview, "rookie_option")}
          tone="info"
          onClick={
            !rookieOptionBlockedReason && currentContract
              ? () => props.onPreviewRookieOption(currentContract.id)
              : null
          }
          testId="action-rookie-option-preview"
        />
      </div>

      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
        <p className="text-sm text-slate-300">
          <span className="font-medium">Decision Process:</span> All actions remain preview-only until you confirm the impact. 
          Previews will explain any league rule or phase blockers without changing contract state.
        </p>
      </div>
    </div>
  );
}
