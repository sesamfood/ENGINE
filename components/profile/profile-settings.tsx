"use client";

import { Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

function deletionError(message?: string) {
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

  async function deleteAccount() {
    setPending(true);
    setError(undefined);

    try {
      const result = await authClient.deleteUser({ password });
      if (result.error) {
        setError(deletionError(result.error.message));
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
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Navn</p>
            <p className="font-medium">{session.data.user.name}</p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">E-mail</p>
            <p className="truncate font-medium">{session.data.user.email}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="ring-destructive/30">
        <CardHeader>
          <CardTitle>Slet konto</CardTitle>
          <CardDescription>
            Slet din personlige konto, dine sessioner og din adgang permanent.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Hvis du er den eneste bruger med rollen Administrator, skal du først give
            en anden bruger rollen Administrator. Organisationens øvrige data
            slettes ikke.
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
