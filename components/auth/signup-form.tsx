"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";

export function SignupForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    try {
      const form = new FormData(event.currentTarget);
      const email = String(form.get("email"));
      const loginPath = `/login?verified=1&redirect=${encodeURIComponent(redirectTo)}`;
      const result = await authClient.signUp.email({
        name: String(form.get("name")),
        email,
        password: String(form.get("password")),
        callbackURL: `${window.location.origin}${loginPath}`,
      });

      if (result.error) {
        setError(
          "Kontoen kunne ikke oprettes. Kontrollér oplysningerne og prøv igen.",
        );
        return;
      }

      const userId = result.data?.user?.id;
      if (userId) {
        posthog.identify(userId);
        posthog.capture("user_signed_up");
      }

      router.push(
        `/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirectTo)}`,
      );
    } catch {
      setError(
        "Kontoen kunne ikke oprettes. Kontrollér forbindelsen og prøv igen.",
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
          <FieldLabel htmlFor="name">Navn</FieldLabel>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            minLength={2}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Adgangskode</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
          />
          <FieldDescription>Brug mindst 12 tegn.</FieldDescription>
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Opret konto
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        Har du allerede en konto?{" "}
        <Link
          href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Log ind
        </Link>
      </p>
    </form>
  );
}
