import { PlayerRefreshJobDetailWorkspace } from "@/components/player-refresh/player-refresh-job-detail-workspace";

export default async function CommissionerPlayerRefreshJobPage(props: {
  params: Promise<{ jobId: string }>;
}) {
  const params = await props.params;

  return <PlayerRefreshJobDetailWorkspace jobId={params.jobId} />;
}
