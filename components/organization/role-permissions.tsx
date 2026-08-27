"use client";

import { useMutation, useQuery } from "convex/react";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import {
  permissionCatalog,
  type DataGranularity,
} from "@/lib/auth-permissions";

type RoleRow = {
  role: string;
  name: string;
  isSystem: boolean;
  granularity: DataGranularity;
  permissions: string[];
};

type Draft = Record<string, string[]>;

const granularityItems = [
  { value: "detail", label: "Detaljer" },
  { value: "aggregate", label: "Kun totaler" },
  { value: "anonymous", label: "Anonymiseret" },
] satisfies Array<{ value: DataGranularity; label: string }>;

function messageFrom(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Handlingen kunne ikke gennemføres";
}

export function RolePermissions() {
  const allowed = usePermission("roles.manage");
  const rows = useQuery(
    api.access.listRolePermissions,
    allowed ? {} : "skip",
  ) as RoleRow[] | undefined;
  const ensureRoles = useMutation(api.access.ensureRoles);
  const createRole = useMutation(api.access.createRole);
  const deleteRole = useMutation(api.access.deleteRole);
  const saveRole = useMutation(api.access.saveRolePermissions);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [granularityDraft, setGranularityDraft] = useState<Record<
    string,
    DataGranularity
  > | null>(null);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [roleName, setRoleName] = useState("");
  const [createError, setCreateError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RoleRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (allowed) void ensureRoles({});
  }, [allowed, ensureRoles]);

  const initialDraft = Object.fromEntries(
    (rows ?? []).map((row) => [row.role, row.permissions]),
  );
  const currentDraft = draft ?? initialDraft;
  const initialGranularity = Object.fromEntries(
    (rows ?? []).map((row) => [row.role, row.granularity]),
  ) as Record<string, DataGranularity>;
  const currentGranularity = granularityDraft ?? initialGranularity;
  const changedRoles =
    rows?.filter((role) => {
      const before = role.permissions;
      const after = currentDraft[role.role] ?? [];
      return (
        before.length !== after.length ||
        before.some((permission) => !after.includes(permission)) ||
        role.granularity !== (currentGranularity[role.role] ?? "detail")
      );
    }) ?? [];

  function setPermission(role: string, permission: string, checked: boolean) {
    const existing = new Set(currentDraft[role] ?? []);
    if (checked) existing.add(permission);
    else existing.delete(permission);
    setDraft({ ...currentDraft, [role]: [...existing] });
  }

  async function save() {
    if (!rows || !changedRoles.length) return;
    if (!reason.trim()) {
      toast.error("Angiv en begrundelse for ændringerne");
      return;
    }
    setSaving(true);
    try {
      const ordered = [...changedRoles].sort((left, right) => {
        const manages = (role: string) =>
          currentDraft[role]?.includes("roles.manage") &&
          currentDraft[role]?.includes("members.manage");
        return Number(manages(right.role)) - Number(manages(left.role));
      });
      for (const role of ordered) {
        await saveRole({
          role: role.role,
          permissions: currentDraft[role.role] ?? [],
          granularity: currentGranularity[role.role] ?? "detail",
          reason,
        });
      }
      setDraft(null);
      setGranularityDraft(null);
      setReason("");
      toast.success("Rollerne er gemt");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    setCreating(true);
    setCreateError("");
    try {
      await createRole({ name: roleName });
      setRoleName("");
      setCreateOpen(false);
      setDraft(null);
      setGranularityDraft(null);
      toast.success("Rollen er oprettet");
    } catch (error) {
      setCreateError(messageFrom(error));
    } finally {
      setCreating(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRole({ role: pendingDelete.role });
      setPendingDelete(null);
      setDraft(null);
      setGranularityDraft(null);
      toast.success("Rollen er slettet");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setDeleting(false);
    }
  }

  if (!allowed) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere roller.
        </AlertDescription>
      </Alert>
    );
  }

  if (!rows) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="max-w-6xl">
      <Card className="overflow-visible">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Roller og adgang</CardTitle>
            <CardDescription>
              Vælg hvilke handlinger hver rolle må udføre i organisationen.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setCreateOpen(true)}>
            <PlusIcon data-icon="inline-start" />
            Ny rolle
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto md:[&_[data-slot=table-container]]:overflow-visible">
          <Table className="min-w-[42rem]">
            <TableHeader className="sticky top-16 bg-card md:top-24">
              <TableRow>
                <TableHead>Handling</TableHead>
                {rows.map((role) => (
                  <TableHead key={role.role} className="min-w-36 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <span>{role.name}</span>
                      {!role.isSystem ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Slet rollen ${role.name}`}
                          onClick={() => setPendingDelete(role)}
                        >
                          <Trash2Icon />
                        </Button>
                      ) : null}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Datavisning</TableCell>
                {rows.map((role) => (
                  <TableCell key={role.role}>
                    <Select
                      items={granularityItems}
                      value={currentGranularity[role.role] ?? "detail"}
                      onValueChange={(value) => {
                        if (!value) return;
                        setGranularityDraft({
                          ...currentGranularity,
                          [role.role]: value as DataGranularity,
                        });
                      }}
                      disabled={saving}
                    >
                      <SelectTrigger
                        className="h-10 w-full"
                        aria-label={`Datavisning for ${role.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="detail">Detaljer</SelectItem>
                          <SelectItem value="aggregate">Kun totaler</SelectItem>
                          <SelectItem value="anonymous">Anonymiseret</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </TableCell>
                ))}
              </TableRow>
              {permissionCatalog.map((group) => (
                <Fragment key={group.group}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell
                      colSpan={rows.length + 1}
                      className="font-semibold"
                    >
                      {group.group}
                    </TableCell>
                  </TableRow>
                  {group.permissions.map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium">
                        {permission.label}
                      </TableCell>
                      {rows.map((role) => (
                        <TableCell
                          key={role.role}
                          className="text-center [&:has([role=checkbox])]:pr-2"
                        >
                          <Checkbox
                            className="mx-auto"
                            checked={(currentDraft[role.role] ?? []).includes(
                              permission.id,
                            )}
                            disabled={saving}
                            aria-label={`${permission.label} for ${role.name}`}
                            onCheckedChange={(value) =>
                              setPermission(
                                role.role,
                                permission.id,
                                value === true,
                              )
                            }
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <Field className="sm:max-w-md sm:flex-1">
            <FieldLabel htmlFor="role-change-reason">Begrundelse</FieldLabel>
            <Input
              id="role-change-reason"
              value={reason}
              maxLength={1000}
              placeholder="Beskriv hvorfor adgangen ændres"
              disabled={saving}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <Button
            onClick={save}
            disabled={saving || !changedRoles.length || !reason.trim()}
          >
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            Gem ændringer
          </Button>
        </CardFooter>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!creating) setCreateOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ny rolle</DialogTitle>
            <DialogDescription>
              Opret en navngivet rolle. Tilladelser vælges bagefter.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={Boolean(createError)}>
              <FieldLabel htmlFor="new-role-name">Navn</FieldLabel>
              <Input
                id="new-role-name"
                value={roleName}
                aria-invalid={Boolean(createError)}
                onChange={(event) => {
                  setRoleName(event.target.value);
                  setCreateError("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void create();
                  }
                }}
              />
              <FieldError>{createError}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              Annullér
            </Button>
            <Button disabled={creating || !roleName.trim()} onClick={create}>
              {creating ? <Spinner data-icon="inline-start" /> : null}
              Opret rolle
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleting) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet rolle?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name} slettes permanent. Rollen kan kun slettes,
              når ingen brugere bruger den.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={remove}
            >
              {deleting ? <Spinner data-icon="inline-start" /> : null}
              Slet rolle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
