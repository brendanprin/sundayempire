import { redirect } from "next/navigation";

export default function PicksPage() {
  redirect("/draft?legacy=picks#pick-ownership-operations");
}
