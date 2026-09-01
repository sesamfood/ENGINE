"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

type AcceptanceFailure = {
  kind: "acceptance" | "wrong-account";
  message: string;
};

function isExistingMemberError(error: {
  code?: string;
  message?: string;
}) {
  return (
    error.code === "USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION" ||
    error.message?.includes("kun tilhøre én organisation")
  );
}

export function InvitationCard({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const acceptanceAttempted = useRef(false);
  const [failure, setFailure] = useState<AcceptanceFailure>();
  const [signingOut, setSigningOut] = useState(false);
  const redirect = `/invitation/${invitationId}`;

  useEffect(() => {
    if (!session || acceptanceAttempted.current) {
      return;
    }

    acceptanceAttempted.current = true;

    void authClient.organization
      .acceptInvitation({ invitationId })
      .then((result) => {
        if (!result.error && result.data) {
          router.replace("/");
          router.refresh();
          return;
        }

        if (result.error?.code === "INVITATION_NOT_FOUND") {
          window.location.reload();
          return;
        }

        if (result.error && isExistingMemberError(result.error)) {
          router.replace("/");
          router.refresh();
          return;
        }

        setFailure({
          kind:
            result.error?.code ===
            "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"
              ? "wrong-account"
              : "acceptance",
          message:
            result.error?.code ===
            "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION"
              ? "Log ind med den e-mailadresse, invitationen blev sendt til."
              : "Invitationen kunne ikke accepteres. Prøv igen.",
        });
      })
      .catch(() => {
        setFailure({
          kind: "acceptance",
          message:
            "Invitationen kunne ikke accepteres. Kontrollér forbindelsen og prøv igen.",
        });
      });
  }, [invitationId, router, session]);

  async function signOut() {
    setSigningOut(true);

    try {
      const result = await authClient.signOut();
      if (result.error) {
        setFailure({
          kind: "wrong-account",
          message: "Du kunne ikke logges ud. Prøv igen.",
        });
        return;
      }
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
      router.refresh();
    } catch {
      setFailure({
        kind: "wrong-account",
        message:
          "Du kunne ikke logges ud. Kontrollér forbindelsen og prøv igen.",
      });
    } finally {
      setSigningOut(false);
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

  if (failure) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="destructive">
          <AlertDescription>{failure.message}</AlertDescription>
        </Alert>
        {failure.kind === "acceptance" ? (
          <Button
            type="button"
            size="lg"
            onClick={() => window.location.reload()}
          >
            Prøv igen
          </Button>
        ) : null}
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={signOut}
          disabled={signingOut}
        >
          {signingOut ? <Spinner data-icon="inline-start" /> : null}
          Log ud og skift konto
        </Button>
      </div>
    );
  }

  return (
    <div
      className="flex justify-center py-6"
      aria-label="Accepterer invitation"
    >
      <Spinner />
    </div>
  );
}
