import Link from "next/link";
import { RequestResetForm } from "@/components/auth/request-reset-form";

export default function ResetPage() {
  return <main className="flex min-h-svh items-center justify-center p-4"><div className="w-full max-w-sm space-y-5">
    <h1 className="text-2xl font-semibold">Passwort zurücksetzen</h1>
    <p className="text-sm text-muted-foreground">Wenn ein aktives Konto existiert, senden wir einen Link per E-Mail.</p>
    <RequestResetForm />
    <Link href="/login" className="text-sm underline">Zur Anmeldung</Link>
  </div></main>;
}
