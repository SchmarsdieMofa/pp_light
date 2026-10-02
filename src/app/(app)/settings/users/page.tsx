import { redirect } from "next/navigation";

/** User management lives in the settings overlay. */
export default function UsersSettingsPage() {
  redirect("/?settings=nutzer");
}
