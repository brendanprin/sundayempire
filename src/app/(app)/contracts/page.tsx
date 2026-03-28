import { redirect } from "next/navigation";

export default function ContractsPage() {
  redirect("/commissioner?legacy=contracts#contract-operations");
}
