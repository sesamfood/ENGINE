"use client";

import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

function deletionError(error?: { message?: string }) {
  const message = error?.message;
  if (message?.includes("Giv en anden bruger rollen Administrator")) {
    return "Giv en anden bruger rollen Administrator, før du sletter din konto.";
  }
  if (message?.toLowerCase().includes("password")) {
    return "Adgangskoden er forkert.";
  }
  return "Kontoen kunne ikke slettes. Prøv igen.";
}

export function ProfileSettings() {
  const router = useRouter();
  const session = authClient.useSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [nameDraft, setNameDraft] = useState("");
  const nameInitializedFor = useRef<string | null>(null);
  const [namePending, setNamePending] = useState(false);
  const [nameError, setNameError] = useState<string>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);
  const [passwordError, setPasswordError] = useState<string>();

  const sessionUser = session.data?.user;
  const sessionUserId = sessionUser?.id;
  const sessionUserName = sessionUser?.name;
  useEffect(() => {
    if (!sessionUserId || !sessionUserName) return;
    if (nameInitializedFor.current === sessionUserId) return;
    nameInitializedFor.current = sessionUserId;
    window.setTimeout(() => setNameDraft(sessionUserName));
  }, [sessionUserId, sessionUserName]);

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) return;
    setNamePending(true);
    setNameError(undefined);
    try {
      const result = await authClient.updateUser({ name });
      if (result.error) {
        setNameError("Navnet kunne ikke gemmes. Prøv igen.");
        return;
      }
      toast.success("Navnet er gemt");
      router.refresh();
    } catch {
      setNameError("Navnet kunne ikke gemmes. Kontrollér forbindelsen og prøv igen.");
    } finally {
      setNamePending(false);
    }
  }

  async function changePassword() {
    setPasswordPending(true);
    setPasswordError(undefined);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setPasswordError(
          result.error.message?.toLowerCase().includes("password")
            ? "Den nuværende adgangskode er forkert."
            : "Adgangskoden kunne ikke opdateres. Prøv igen.",
        );
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      toast.success("Adgangskoden er opdateret");
    } catch {
      setPasswordError(
        "Adgangskoden kunne ikke opdateres. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPasswordPending(false);
    }
  }

  async function deleteAccount() {
    setPending(true);
    setError(undefined);

    try {
      const result = await authClient.deleteUser({ password });
      if (result.error) {
        setError(deletionError(result.error));
        return;
      }

      router.replace("/login?deleted=1");
      router.refresh();
    } catch {
      setError(
        "Kontoen kunne ikke slettes. Kontrollér forbindelsen og prøv igen.",
      );
    } finally {
      setPending(false);
    }
  }

  if (session.isPending) {
    return <Skeleton className="h-64 w-full max-w-2xl" />;
  }

  if (session.error || !session.data) {
    return (
      <Alert variant="destructive" className="max-w-2xl">
        <AlertDescription>
          Profiloplysningerne kunne ikke indlæses. Genindlæs siden og prøv igen.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profiloplysninger</CardTitle>
          <CardDescription>
            Dine personlige oplysninger.
          </CardDescription>
        </CardHeader>
        <CardContent appearance="stacked">
          {nameError ? (
            <Alert variant="destructive">
              <AlertDescription>{nameError}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(nameError)}>
            <FieldLabel htmlFor="profile-name">Navn</FieldLabel>
            <Input
              id="profile-name"
              autoComplete="name"
              value={nameDraft}
              onChange={(event) => setNameDraft(event.target.value)}
              aria-invalid={Boolean(nameError)}
              disabled={namePending}
            />
          </Field>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">E-mail</p>
            <p className="truncate font-medium">{session.data.user.email}</p>
          </div>
          <div>
            <Button
              type="button"
              size="lg"
              disabled={
                namePending ||
                !nameDraft.trim() ||
                nameDraft.trim() === session.data.user.name
              }
              onClick={() => void saveName()}
            >
              {namePending ? <Spinner data-icon="inline-start" /> : null}
              Gem navn
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adgangskode</CardTitle>
          <CardDescription>
            Skift din adgangskode. Dine andre sessioner logges ud.
          </CardDescription>
        </CardHeader>
        <CardContent appearance="stacked">
          {passwordError ? (
            <Alert variant="destructive">
              <AlertDescription>{passwordError}</AlertDescription>
            </Alert>
          ) : null}
          <Field data-invalid={Boolean(passwordError)}>
            <FieldLabel htmlFor="profile-current-password">
              Nuværende adgangskode
            </FieldLabel>
            <PasswordInput
              id="profile-current-password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(passwordError)}
              disabled={passwordPending}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-new-password">
              Ny adgangskode
            </FieldLabel>
            <PasswordInput
              id="profile-new-password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={12}
              maxLength={256}
              disabled={passwordPending}
            />
            <FieldDescription>Brug mindst 12 tegn.</FieldDescription>
          </Field>
          <div>
            <Button
              type="button"
              size="lg"
              disabled={
                passwordPending ||
                currentPassword.length < 1 ||
                newPassword.length < 12
              }
              onClick={() => void changePassword()}
            >
              {passwordPending ? <Spinner data-icon="inline-start" /> : null}
              Opdatér adgangskode
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card appearance="danger">
        <CardHeader>
          <CardTitle>Slet konto</CardTitle>
          <CardDescription>
            Slet din personlige konto, dine sessioner og din adgang permanent.
          </CardDescription>
        </CardHeader>
        <CardContent appearance="stacked" className="flex flex-col items-start">
          <p className="text-sm leading-6 text-muted-foreground">
            Er du den eneste bruger med rollen Administrator, skal du først give
            rollen til en anden bruger. Organisationens øvrige data slettes ikke.
          </p>
          <AlertDialog
            open={dialogOpen}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open) {
                setPassword("");
                setError(undefined);
              }
            }}
          >
            <AlertDialogTrigger
              render={<Button type="button" variant="destructive" size="lg" />}
            >
              <Trash2Icon data-icon="inline-start" />
              Slet min konto
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia>
                  <TriangleAlertIcon aria-hidden="true" />
                </AlertDialogMedia>
                <AlertDialogTitle>Slet din konto permanent?</AlertDialogTitle>
                <AlertDialogDescription>
                  Handlingen kan ikke fortrydes. Indtast din adgangskode for at
                  bekræfte.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="delete-account-password">
                  Adgangskode
                </FieldLabel>
                <Input
                  id="delete-account-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={12}
                  maxLength={256}
                  required
                  aria-invalid={Boolean(error)}
                  disabled={pending}
                />
                <FieldDescription>
                  Dette bekræfter, at det er dig, der sletter kontoen.
                </FieldDescription>
              </Field>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>
                  Annullér
                </AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  variant="destructive"
                  disabled={pending || password.length < 12}
                  onClick={() => void deleteAccount()}
                >
                  {pending ? <Spinner data-icon="inline-start" /> : null}
                  Slet konto permanent
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
