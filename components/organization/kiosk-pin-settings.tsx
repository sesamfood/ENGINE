"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { KeyRoundIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocationAccess } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";

type Location = { id: Id<"locations">; name: string };

export function KioskPinSettings() {
  const { locations } = useLocationAccess();
  const pinLocations = useQuery(api.kiosk.listPinLocations);
  const setLocationPin = useMutation(api.kiosk.setLocationPin);
  const [editing, setEditing] = useState<Location | null>(null);
  const [pin, setPin] = useState("");
  const [pendingId, setPendingId] = useState<Id<"locations">>();

  async function save(location: Location, value: string | null) {
    setPendingId(location.id);
    try {
      await setLocationPin({ locationId: location.id, pin: value });
      toast.success(value ? "PIN-koden er gemt" : "PIN-koden er fjernet");
      setEditing(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "PIN-koden kunne ikke gemmes. Prøv igen."));
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PIN-koder</CardTitle>
        <CardDescription>
          Sider med PIN-kode kræver lokationens kode i kiosktilstand. Lokationer uden kode låser ikke siderne.
        </CardDescription>
      </CardHeader>
      <CardContent appearance="compact" className="flex flex-col">
        {pinLocations === undefined ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          locations.map((location) => {
            const hasPin = pinLocations.includes(location.id);
            return (
              <div
                key={location.id}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <p className="font-medium">{location.name}</p>
                  <Badge variant={hasPin ? "default" : "secondary"}>
                    {hasPin ? "PIN-kode angivet" : "Ingen PIN-kode"}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPin("");
                      setEditing(location);
                    }}
                  >
                    <KeyRoundIcon data-icon="inline-start" />
                    {hasPin ? "Skift PIN-kode" : "Angiv PIN-kode"}
                  </Button>
                  {hasPin ? (
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button type="button" variant="outline" disabled={pendingId === location.id}>
                            <Trash2Icon data-icon="inline-start" />
                            Fjern
                          </Button>
                        }
                      />
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Fjern PIN-koden?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Sider med PIN-kode bliver åbne for alle kiosker på {location.name}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annullér</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => save(location, null)}>
                            Fjern PIN-kode
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (editing) void save(editing, pin);
            }}
            className="flex flex-col gap-4"
          >
            <DialogHeader>
              <DialogTitle>PIN-kode for {editing?.name}</DialogTitle>
              <DialogDescription>
                Kiosker på lokationen bruger koden til at åbne sider med PIN-kode.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="kiosk-location-pin">PIN-kode</FieldLabel>
              <Input
                id="kiosk-location-pin"
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                minLength={4}
                maxLength={8}
                pattern="\d{4,8}"
                required
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
              />
              <FieldDescription>4–8 cifre.</FieldDescription>
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={pendingId !== undefined || pin.length < 4}>
                {pendingId ? <Spinner data-icon="inline-start" /> : null}
                Gem PIN-kode
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
