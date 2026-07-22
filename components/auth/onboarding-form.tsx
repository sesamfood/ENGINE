"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";

function organizationSlug(name: string) {
  const normalized = name
    .toLocaleLowerCase("da")
    .replaceAll("æ", "ae")
    .replaceAll("ø", "oe")
    .replaceAll("å", "aa")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${normalized || "organisation"}-${crypto.randomUUID().slice(0, 8)}`;
}

function invitationIdFromCode(value: string) {
  const code = value.trim();
  const match = code.match(/(?:^|\/)invitation\/([^/?#]+)/);

  if (!match) return code;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function OnboardingForm() {
  const router = useRouter();
  const organizations = authClient.useListOrganizations();
  const activeOrganization = authClient.useActiveOrganization();
  const activeOrganizationId = activeOrganization.data?.id;
  const firstOrganizationId = organizations.data?.[0]?.id;
  const [pendingAction, setPendingAction] = useState<"create" | "join">();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (organizations.isPending || activeOrganization.isPending) return;

    if (activeOrganizationId) {
      router.replace("/transfers");
      return;
    }

    if (!firstOrganizationId) return;

    void authClient.organization
      .setActive({ organizationId: firstOrganizationId })
      .then(({ error: setActiveError }) => {
        if (setActiveError) {
          setError("Organisationen kunne ikke aktiveres. Prøv igen.");
          return;
        }
        router.replace("/transfers");
        router.refresh();
      })
      .catch(() => {
        setError("Organisationen kunne ikke aktiveres. Prøv igen.");
      });
  }, [
    activeOrganization.isPending,
    activeOrganizationId,
    firstOrganizationId,
    organizations.isPending,
    router,
  ]);

  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPendingAction("create");

    try {
      const form = new FormData(event.currentTarget);
      const name = String(form.get("name")).trim();
      const result = await authClient.organization.create({
        name,
        slug: organizationSlug(name),
      });

      if (result.error || !result.data) {
        setError(
          result.error?.message?.includes("kun være medlem")
            ? "Du er allerede medlem af en organisation."
            : "Organisationen kunne ikke oprettes. Prøv igen.",
        );
        return;
      }

      const activeResult = await authClient.organization.setActive({
        organizationId: result.data.id,
      });
      if (activeResult.error) {
        setError("Organisationen blev oprettet, men kunne ikke aktiveres.");
        return;
      }

      router.replace("/transfers");
      router.refresh();
    } catch {
      setError(
        "Organisationen kunne ikke oprettes. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPendingAction(undefined);
    }
  }

  async function joinOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setPendingAction("join");

    try {
      const form = new FormData(event.currentTarget);
      const invitationId = invitationIdFromCode(String(form.get("code")));
      const result = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if (result.error || !result.data) {
        setError(
          result.error?.message?.includes("kun være medlem")
            ? "Du er allerede medlem af en organisation og kan derfor ikke acceptere invitationen."
            : "Koden kunne ikke bruges. Kontrollér koden, og at du er logget ind med den inviterede e-mail.",
        );
        return;
      }

      const activeResult = await authClient.organization.setActive({
        organizationId: result.data.member.organizationId,
      });
      if (activeResult.error) {
        setError("Du blev tilmeldt, men organisationen kunne ikke aktiveres.");
        return;
      }

      router.replace("/transfers");
      router.refresh();
    } catch {
      setError(
        "Koden kunne ikke bruges. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPendingAction(undefined);
    }
  }

  if (organizations.isPending || activeOrganization.isPending) {
    return (
      <div
        className="flex justify-center py-6"
        aria-label="Indlæser organisation"
      >
        <Spinner />
      </div>
    );
  }

  if (organizations.error || activeOrganization.error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Organisationer kunne ikke indlæses</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          Kontrollér forbindelsen, og prøv igen.
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void organizations.refetch();
              void activeOrganization.refetch();
            }}
          >
            Prøv igen
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (organizations.data?.length || activeOrganization.data) {
    return (
      <div className="flex justify-center py-6" aria-label="Åbner organisation">
        <Spinner />
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
      <Tabs defaultValue="create" className="gap-5">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="create">Opret organisation</TabsTrigger>
          <TabsTrigger value="join">Tilmeld med kode</TabsTrigger>
        </TabsList>

        <TabsContent value="create">
          <form onSubmit={createOrganization} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="organization-name">
                  Organisationens navn
                </FieldLabel>
                <Input
                  id="organization-name"
                  name="name"
                  autoComplete="organization"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </Field>
            </FieldGroup>
            <Button
              type="submit"
              size="lg"
              disabled={pendingAction !== undefined}
            >
              {pendingAction === "create" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Opret organisation
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="join">
          <form onSubmit={joinOrganization} className="flex flex-col gap-5">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="invitation-code">
                  Invitationskode
                </FieldLabel>
                <Input
                  id="invitation-code"
                  name="code"
                  autoComplete="off"
                  required
                />
                <FieldDescription>
                  Indsæt koden fra invitationen. Du kan også indsætte hele
                  invitationslinket.
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Button
              type="submit"
              size="lg"
              disabled={pendingAction !== undefined}
            >
              {pendingAction === "join" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Tilmeld organisation
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
