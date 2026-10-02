import { redirect } from "next/navigation";

/** Settings open as an overlay above the current view. */
export default function SettingsPage() {
  redirect("/?settings=konto");
}
