"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoginForm } from "@/components/auth/login-form";
import { SignupForm } from "@/components/auth/signup-form";
import { Button } from "@/components/ui/button";
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

export function InvitationCard({
  invitationId,
  email,
  hasAccount,
}: {
  invitationId: string;
  email: string;
  hasAccount: boolean;
}) {
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
      posthog.reset();
      // Reload so the page shows the form for the invited e-mail.
      window.location.reload();
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
    return hasAccount ? (
      <LoginForm
        redirectTo={redirect}
        verified={false}
        reset={false}
        deleted={false}
        email={email}
      />
    ) : (
      <SignupForm redirectTo={redirect} email={email} />
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
