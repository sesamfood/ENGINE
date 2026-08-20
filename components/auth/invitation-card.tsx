"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function InvitationCard({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [pending, setPending] = useState<"accept" | "signout">();
  const [error, setError] = useState<string>();
  const redirect = `/invitation/${invitationId}`;

  async function accept() {
    setError(undefined);
    setPending("accept");

    try {
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if (result.error) {
        setError(
          result.error.message?.includes("kun tilhøre én organisation")
            ? "Din bruger tilhører allerede en organisation og kan ikke acceptere invitationen."
            : "Invitationen kunne ikke accepteres. Kontrollér, at du er logget ind med den inviterede e-mail.",
        );
        return;
      }

      router.replace("/onboarding");
      router.refresh();
    } catch {
      setError(
        "Invitationen kunne ikke accepteres. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(undefined);
    }
  }

  async function signOut() {
    setError(undefined);
    setPending("signout");

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Du kunne ikke logges ud. Prøv igen.");
        return;
      }
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
      router.refresh();
    } catch {
      setError(
        "Du kunne ikke logges ud. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(undefined);
    }
  }

  if (sessionPending) {
    return (
      <div
        className="flex justify-center py-6"
        aria-label="Indlæser invitation"
      >
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href={`/login?redirect=${encodeURIComponent(redirect)}`}
          className={buttonVariants({ size: "lg" })}
        >
          Log ind
        </Link>
        <Link
          href={`/signup?redirect=${encodeURIComponent(redirect)}`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Opret konto
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Du er logget ind som {session.user.email}.
      </p>
      <Button
        type="button"
        size="lg"
        onClick={accept}
        disabled={Boolean(pending)}
      >
        {pending === "accept" ? <Spinner data-icon="inline-start" /> : null}
        Acceptér invitation
      </Button>
      <Button
        type="button"
        size="lg"
        variant="outline"
        onClick={signOut}
        disabled={Boolean(pending)}
      >
        {pending === "signout" ? <Spinner data-icon="inline-start" /> : null}
        Log ud og skift konto
      </Button>
    </div>
  );
}
