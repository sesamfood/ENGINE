"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PencilIcon, PlusIcon, Trash2Icon, TruckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

type Supplier = FunctionReturnType<typeof api.suppliers.list>[number];
type Draft = { supplier: Supplier | null; name: string; email: string };

export function SupplierSettings() {
  const canManage = usePermission("organization.settings");
  const suppliers = useQuery(api.suppliers.list, canManage ? {} : "skip");
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const remove = useMutation(api.suppliers.remove);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Supplier | null>(null);

  if (!canManage) return null;
  if (suppliers === undefined) return <Skeleton className="h-56 max-w-3xl" />;

  function open(supplier: Supplier | null) {
    setError("");
    setDraft({
      supplier,
      name: supplier?.name ?? "",
      email: supplier?.email ?? "",
    });
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    const values = { name: draft.name, email: draft.email.trim() || null };
    try {
      if (draft.supplier) {
        await update({ supplierId: draft.supplier.id, ...values });
        toast.success("Leverandøren er gemt");
      } else {
        await create(values);
        toast.success("Leverandøren er oprettet");
      }
      setDraft(null);
    } catch (caught) {
      setError(
        getUserErrorMessage(
          caught,
          "Leverandøren kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setSaving(true);
    try {
      await remove({ supplierId: pendingDelete.id });
      toast.success("Leverandøren er slettet");
      setPendingDelete(null);
    } catch (caught) {
      toast.error(
        getUserErrorMessage(
          caught,
          "Leverandøren kunne ikke slettes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Leverandører</CardTitle>
        <CardDescription>
          Vælg en leverandør, når du planlægger en bestilling. Bestillingen kan
          sendes til leverandørens e-mail.
        </CardDescription>
        <CardAction>
          <Button size="lg" onClick={() => open(null)}>
            <PlusIcon data-icon="inline-start" />
            Tilføj leverandør
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {suppliers.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TruckIcon />
              </EmptyMedia>
              <EmptyTitle>Ingen leverandører</EmptyTitle>
              <EmptyDescription>
                Tilføj den første leverandør for at bestille hos den.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead className="w-28">
                  <span className="sr-only">Handlinger</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{supplier.name}</span>
                      {supplier.managed ? (
                        <Badge variant="secondary">GS Supply</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="text-muted-foreground">
                      {supplier.email ?? "Ingen e-mail"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Redigér ${supplier.name}`}
                        onClick={() => open(supplier)}
                      >
                        <PencilIcon />
                      </Button>
                      {supplier.managed ? null : (
                        <Button
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Slet ${supplier.name}`}
                          onClick={() => setPendingDelete(supplier)}
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog
        open={draft !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setDraft(null);
        }}
      >
        <DialogContent>
          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {draft?.supplier ? "Redigér leverandør" : "Tilføj leverandør"}
              </DialogTitle>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="supplier-name">Navn</FieldLabel>
                <Input
                  id="supplier-name"
                  className="h-11"
                  value={draft?.name ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="supplier-email">
                  E-mail til bestillinger
                </FieldLabel>
                <Input
                  id="supplier-email"
                  type="email"
                  className="h-11"
                  value={draft?.email ?? ""}
                  disabled={saving}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, email: event.target.value }
                        : current,
                    )
                  }
                />
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={saving}
                onClick={() => setDraft(null)}
              >
                Annullér
              </Button>
              <Button
                type="submit"
                size="lg"
                disabled={saving || !draft?.name.trim()}
              >
                {saving ? <Spinner data-icon="inline-start" /> : null}
                Gem leverandør
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next && !saving) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Leverandøren kan ikke længere vælges i nye bestillinger. Tidligere
              bestillinger beholder leverandørens navn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Slet leverandør
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
