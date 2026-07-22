"use client";

import Link from "next/link";
import { MailCheckIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function VerifyEmailNotice({
  email,
  redirectTo,
}: {
  email?: string;
  redirectTo: string;
}) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  async function resend() {
    if (!email) return;
    setPending(true);
    setSent(false);
    setError(undefined);

    try {
      const callbackURL = new URL("/login", window.location.origin);
      callbackURL.searchParams.set("verified", "1");
      callbackURL.searchParams.set("redirect", redirectTo);
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: callbackURL.toString(),
      });
      if (result.error) {
        setError("E-mailen kunne ikke sendes. Prøv igen om lidt.");
        return;
      }
      setSent(true);
    } catch {
      setError(
        "E-mailen kunne ikke sendes. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <MailCheckIcon className="size-10 text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Åbn linket i e-mailen. Derefter kan du logge ind og fortsætte.
      </p>
      {sent ? (
        <Alert>
          <AlertDescription>Et nyt bekræftelseslink er sendt.</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {email ? (
        <Button
          type="button"
          variant="outline"
          onClick={resend}
          disabled={pending}
        >
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Send linket igen
        </Button>
      ) : null}
      <Link
        href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
        className={buttonVariants({ variant: email ? "ghost" : "outline" })}
      >
        Tilbage til login
      </Link>
    </div>
  );
}
