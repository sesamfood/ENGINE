"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    try {
      const form = new FormData(event.currentTarget);
      const result = await authClient.requestPasswordReset({
        email: String(form.get("email")),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (result.error) {
        setError("Anmodningen kunne ikke sendes. Prøv igen om lidt.");
        return;
      }
      setSent(true);
    } catch {
      setError(
        "Anmodningen kunne ikke sendes. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-5">
        <Alert>
          <AlertDescription>
            Hvis e-mailen findes, har vi sendt et link til at vælge en ny
            adgangskode.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          render={<Link href="/login" />}
          nativeButton={false}
        >
          Tilbage til login
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="reset-email">E-mail</FieldLabel>
          <Input
            id="reset-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Send nulstillingslink
      </Button>
      <Link
        href="/login"
        className="text-center text-sm font-medium text-foreground underline underline-offset-4"
      >
        Tilbage til login
      </Link>
    </form>
  );
}
