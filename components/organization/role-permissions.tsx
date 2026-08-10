"use client";

import { useMutation, useQuery } from "convex/react";
import { SaveIcon } from "lucide-react";
import { Fragment, useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  permissionCatalog,
  type OrganizationRole,
} from "@/lib/auth-permissions";
import { cn } from "@/lib/utils";

const roles: Array<{ id: OrganizationRole; label: string }> = [
  { id: "admin", label: "Administrator" },
  { id: "manager", label: "Manager" },
  { id: "member", label: "Standardbruger" },
];

type Draft = Record<OrganizationRole, string[]>;

function emptyDraft(): Draft {
  return { admin: [], manager: [], member: [] };
}

export function RolePermissions() {
  const allowed = usePermission("roles.manage");
  const rows = useQuery(api.access.listRolePermissions, allowed ? {} : "skip");
  const saveRole = useMutation(api.access.saveRolePermissions);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const initialDraft = emptyDraft();
  if (rows) {
    for (const row of rows) initialDraft[row.role] = row.permissions;
  }
  const currentDraft = draft ?? initialDraft;

  function setPermission(role: OrganizationRole, permission: string, checked: boolean) {
    if (role === "admin") return;
    setDraft((current) => {
      const existing = new Set((current ?? initialDraft)[role]);
      if (checked) existing.add(permission);
      else existing.delete(permission);
      const next: Draft = { ...(current ?? initialDraft) };
      next[role] = [...existing];
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      await Promise.all(
        (roles.filter((role) => role.id !== "admin") as Array<{
          id: "manager" | "member";
          label: string;
        }>).map((role) =>
          saveRole({ role: role.id, permissions: currentDraft[role.id] }),
        ),
      );
      setDraft(null);
      toast.success("Rollerne er gemt");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rollerne kunne ikke gemmes");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til at administrere roller.</AlertDescription>
      </Alert>
    );
  }

  if (!rows) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle>Roller og adgang</CardTitle>
          <CardDescription>
            Vælg hvilke handlinger hver rolle må udføre i organisationen.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[42rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Handling</TableHead>
                {roles.map((role) => (
                  <TableHead key={role.id} className="w-36 text-center">
                    {role.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {permissionCatalog.map((group) => (
                <Fragment key={group.group}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={roles.length + 1} className="font-semibold">
                      {group.group}
                    </TableCell>
                  </TableRow>
                  {group.permissions.map((permission) => (
                    <TableRow key={permission.id}>
                      <TableCell className="font-medium">{permission.label}</TableCell>
                      {roles.map((role) => {
                        const checked =
                          role.id === "admin" ||
                          currentDraft[role.id].includes(permission.id);
                        return (
                          <TableCell key={role.id} className="text-center">
                            <Checkbox
                              className={cn(
                                role.id === "admin" &&
                                  "data-checked:border-muted-foreground/40 data-checked:bg-muted data-checked:text-muted-foreground",
                              )}
                              checked={checked}
                              disabled={role.id === "admin" || saving}
                              aria-label={`${permission.label} for ${role.label}`}
                              onCheckedChange={(value) =>
                                setPermission(role.id, permission.id, value === true)
                              }
                            />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
            Gem ændringer
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
