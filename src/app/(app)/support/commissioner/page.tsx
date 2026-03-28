import Link from "next/link";
import { PageHeaderBand } from "@/components/layout/page-header-band";
import { AdminCommissionerSupportPanel } from "@/components/settings/admin-commissioner-support-panel";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function CommissionerSupportPage() {
  const user = await getAuthenticatedUser();
  const isPlatformAdmin = user?.platformRole === "ADMIN";

  return (
    <div className="space-y-6" data-testid="support-commissioner-page">
      <PageHeaderBand
        eyebrow="Platform Support"
        title="Commissioner Integrity Support"
        description="Dedicated operational workflow for platform admins to triage league integrity and run audited commissioner recovery."
        headingLevel="h2"
      />

      {isPlatformAdmin ? (
        <AdminCommissionerSupportPanel />
      ) : (
        <section
          className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-4 text-amber-100"
          data-testid="support-commissioner-access-denied"
        >
          <p className="text-sm font-semibold">Platform admin access required.</p>
          <p className="mt-2 text-sm text-amber-100/90">
            Commissioner integrity support tools are restricted to platform-admin operations workflows.
          </p>
          <Link href="/settings" className="mt-3 inline-block text-sm text-amber-200 underline">
            Return to settings
          </Link>
        </section>
      )}
    </div>
  );
}
