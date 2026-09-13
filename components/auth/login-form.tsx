"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import posthog from "posthog-js";
import { authClient } from "@/lib/auth-client";

export function LoginForm({
  redirectTo,
  verified,
  reset,
  deleted,
}: {
  redirectTo: string;
  verified: boolean;
  reset: boolean;
  deleted: boolean;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, formAction, pending] = useActionState(submit, undefined);

  async function submit(
    _previousError: string | undefined,
    form: FormData,
  ): Promise<string | undefined> {
    try {
      const enteredIdentifier = String(form.get("identifier"));
      const password = String(form.get("password"));
      // Preserve autofill and submissions captured before hydration on failure.
      setIdentifier(enteredIdentifier);
      setPassword(password);
      const identifier = enteredIdentifier.trim();
      const destination = redirectTo;
      const credentials = {
        password,
        callbackURL: `${window.location.origin}${destination}`,
      };
      const result = identifier.includes("@")
        ? await authClient.signIn.email({ email: identifier, ...credentials })
        : await authClient.signIn.username({ username: identifier, ...credentials });

      if (result.error) {
        return result.error.code === "EMAIL_NOT_VERIFIED"
          ? "Bekræft din e-mail, før du logger ind. Vi har sendt et nyt link."
          : identifier.includes("@")
            ? "E-mail eller adgangskode er forkert."
            : "Brugernavn eller adgangskode er forkert. Har du glemt adgangskoden, skal du kontakte en bruger med rollen Administrator.";
      }

      const userId = result.data?.user?.id;
      if (userId) {
        posthog.identify(userId);
        posthog.capture("user_logged_in", {
          login_method: identifier.includes("@") ? "email" : "username",
        });
      }

      router.replace(destination);
      router.refresh();
    } catch {
      return "Login kunne ikke gennemføres. Kontrollér forbindelsen og prøv igen.";
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {verified ? (
        <Alert>
          <AlertDescription>
            Din e-mail er bekræftet. Du kan nu logge ind.
          </AlertDescription>
        </Alert>
      ) : null}
      {reset ? (
        <Alert>
          <AlertDescription>
            Din adgangskode er ændret. Du kan nu logge ind.
          </AlertDescription>
        </Alert>
      ) : null}
      {deleted ? (
        <Alert>
          <AlertDescription>Din konto er slettet.</AlertDescription>
        </Alert>
      ) : null}
      {error && !pending ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="identifier">E-mail eller brugernavn</FieldLabel>
          <Input
            id="identifier"
            name="identifier"
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Adgangskode</FieldLabel>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
      </FieldGroup>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        Log ind
      </Button>
      <Link
        href="/forgot-password"
        className="text-center text-sm font-medium text-foreground underline underline-offset-4"
      >
        Glemt adgangskode?
      </Link>
      <p className="text-center text-sm text-muted-foreground">
        Har du ikke en konto?{" "}
        <Link
          href={`/signup?redirect=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Opret konto
        </Link>
      </p>
    </form>
  );
}
