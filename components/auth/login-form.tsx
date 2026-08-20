"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
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
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPending(true);

    try {
      const form = new FormData(event.currentTarget);
      const identifier = String(form.get("identifier")).trim();
      const destination = redirectTo;
      const credentials = {
        password: String(form.get("password")),
        callbackURL: `${window.location.origin}${destination}`,
      };
      const result = identifier.includes("@")
        ? await authClient.signIn.email({ email: identifier, ...credentials })
        : await authClient.signIn.username({ username: identifier, ...credentials });

      if (result.error) {
        setError(
          result.error.code === "EMAIL_NOT_VERIFIED"
            ? "Bekræft din e-mail, før du logger ind. Vi har sendt et nyt link."
            : identifier.includes("@")
              ? "E-mail eller adgangskode er forkert."
              : "Brugernavn eller adgangskode er forkert. Kontakt en bruger med rollen Administrator, hvis du har glemt adgangskoden.",
        );
        return;
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setError(
        "Login kunne ikke gennemføres. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      action="/api/auth/sign-in/email"
      method="post"
      onSubmit={submit}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="callbackURL" value={redirectTo} />
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
      {error ? (
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
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Adgangskode</FieldLabel>
          <InputGroup>
            <InputGroupInput
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-sm"
                aria-label={showPassword ? "Skjul adgangskode" : "Vis adgangskode"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
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
