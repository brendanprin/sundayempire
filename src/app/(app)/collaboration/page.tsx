import { RetiredRouteFence } from "@/components/layout/retired-route-fence";

export default function CollaborationPage() {
  return (
    <RetiredRouteFence
      title="Collaboration Utility Retired"
      description="This co-manager prototype is no longer a supported product workflow."
      message="Collaboration was retired during Sprint 14 because it depended on browser-local prototype state and overlapped with the canonical manager trade and roster workflows."
      safetyCopy="Direct links remain safe, but this route no longer runs the old co-manager queue or reminder tools. Use the canonical routes below instead."
      testId="collaboration-retired-route"
      links={[
        {
          href: "/trades",
          label: "Open Trades",
          description: "Use the supported proposal workflow for drafts, submissions, and review.",
        },
        {
          href: "/teams",
          label: "Open My Roster / Cap",
          description: "Make informed roster decisions with contract analysis and compliance tracking.",
        },
        {
          href: "/activity",
          label: "Open League Activity",
          description: "Use the canonical league feed for recent actions instead of prototype queues.",
        },
      ]}
    />
  );
}
