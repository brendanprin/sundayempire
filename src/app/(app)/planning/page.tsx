import { RetiredRouteFence } from "@/components/layout/retired-route-fence";

export default function PlanningPage() {
  return (
    <RetiredRouteFence
      title="Planning Sandbox Retired"
      description="This prototype planning sandbox is no longer part of the supported product surface."
      message="Planning was retired during Sprint 14 because its projections and pick-liquidity experiments overlapped with canonical dashboard, roster, and draft workflows."
      safetyCopy="Direct links remain safe, but this sandbox no longer stores or updates active planning scenarios. Use the canonical routes below for supported decisions."
      testId="planning-retired-route"
      links={[
        {
          href: "/",
          label: "Open Dashboard",
          description: "Use the dashboard for current priorities, deadlines, and trade-entry context.",
        },
        {
          href: "/draft",
          label: "Open Picks & Draft",
          description: "Use the canonical draft workspace for pick ownership, rookie setup, and auction operations.",
        },
        {
          href: "/teams",
          label: "Open Teams Directory",
          description: "Review your roster decisions, contract priorities, and compliance requirements.",
        },
      ]}
    />
  );
}
