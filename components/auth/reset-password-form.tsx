"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function ResetPasswordForm({
  token,
  invalid,
}: {
  token?: string;
  invalid: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmationError, setConfirmationError] = useState<string>();
  const [expiredLink, setExpiredLink] = useState(false);

  if (!token || invalid || expiredLink) {
    return (
      <div className="flex flex-col gap-5">
        <Alert variant="destructive">
          <AlertDescription>
            Linket er ugyldigt eller udløbet. Bed om et nyt nulstillingslink.
          </AlertDescription>
        </Alert>
        <Link
          href="/forgot-password"
          className={buttonVariants({ variant: "outline" })}
        >
          Send et nyt link
        </Link>
      </div>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    setConfirmationError(undefined);

    try {
      const form = new FormData(event.currentTarget);
      const password = String(form.get("password"));
      const confirmation = String(form.get("confirmation"));
      if (password !== confirmation) {
        setConfirmationError("Adgangskoderne er ikke ens.");
        return;
      }

      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (result.error) {
        if (result.error.code === "INVALID_TOKEN") {
          setExpiredLink(true);
        } else {
          setError("Adgangskoden kunne ikke ændres. Prøv igen.");
        }
        return;
      }

      router.replace("/login?reset=1");
      router.refresh();
    } catch {
      setError(
        "Adgangskoden kunne ikke ændres. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(false);
    }
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
          <FieldLabel htmlFor="new-password">Ny adgangskode</FieldLabel>
          <Input
            id="new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
          />
          <FieldDescription>Brug mindst 12 tegn.</FieldDescription>
        </Field>
        <Field data-invalid={Boolean(confirmationError)}>
          <FieldLabel htmlFor="confirm-password">Gentag adgangskode</FieldLabel>
          <Input
            id="confirm-password"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
            aria-invalid={Boolean(confirmationError)}
            aria-describedby={confirmationError ? "confirm-password-error" : undefined}
            onChange={() => setConfirmationError(undefined)}
          />
          <FieldError id="confirm-password-error">{confirmationError}</FieldError>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Gem ny adgangskode
      </Button>
    </form>
  );
}
