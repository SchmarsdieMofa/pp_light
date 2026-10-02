import { redirect } from "next/navigation";

/** User management moved into the settings. */
export default function AdminPage() {
  redirect("/?settings=nutzer");
}
