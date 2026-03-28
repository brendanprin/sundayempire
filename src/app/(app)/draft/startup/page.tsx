import { redirect } from "next/navigation";

type StartupDraftRoutePageProps = {
  searchParams?: Promise<{
    session?: string;
  }>;
};

export default async function StartupDraftWorkspacePage(props: StartupDraftRoutePageProps) {
  const searchParams = await props.searchParams;
  const session = typeof searchParams?.session === "string" ? searchParams.session.trim() : "";
  const target = session
    ? `/draft?startup=retired&session=${encodeURIComponent(session)}`
    : "/draft?startup=retired";

  redirect(target);
}
