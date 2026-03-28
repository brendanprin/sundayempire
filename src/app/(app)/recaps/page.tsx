import { RetiredRouteFence } from "@/components/layout/retired-route-fence";

export default function RecapsPage() {
  return (
    <RetiredRouteFence
      title="Recap Builder Retired"
      description="This recap-builder prototype is no longer part of the supported MVP product flow."
      message="Recaps was retired during Sprint 14 because League Activity is now the canonical route for historical league context and review."
      safetyCopy="Direct links remain safe, but this route no longer generates recap drafts or rivalry timelines. Use the supported feed and audit routes instead."
      testId="recaps-retired-route"
      links={[
        {
          href: "/activity",
          label: "Open League Activity",
          description: "Use the canonical chronological feed for league-visible history.",
        },
        {
          href: "/commissioner/audit",
          label: "Open Commissioner Audit",
          description: "Use the audit surface for governance and operator history.",
        },
        {
          href: "/",
          label: "Open Dashboard",
          description: "Return to the canonical command center for current league priorities.",
        },
      ]}
    />
  );
}
