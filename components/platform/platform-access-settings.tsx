"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  usePlatformRole,
  type PlatformRole,
} from "@/components/platform/platform-shell";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type Member = FunctionReturnType<typeof api.platform.members.list>[number];

const roleOptions: { value: PlatformRole; label: string }[] = [
  { value: "owner", label: "Ejer" },
  { value: "support", label: "Support" },
];

function roleLabel(role: PlatformRole) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function RoleSelect({
  id,
  value,
  disabled,
  onChange,
}: {
  id?: string;
  value: PlatformRole;
  disabled?: boolean;
  onChange: (role: PlatformRole) => void;
}) {
  return (
    <Select
      items={roleOptions}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onChange(next as PlatformRole)}
    >
      <SelectTrigger id={id} className="h-11! w-full sm:w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {roleOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function AddMemberCard() {
  const add = useMutation(api.platform.members.add);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PlatformRole>("support");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await add({ email, role });
      toast.success(`${email.trim()} har fået platformadgang`);
      setEmail("");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Adgangen kunne ikke gives. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Giv platformadgang</CardTitle>
          <CardDescription>
            Brugeren skal allerede have en konto i appen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="sm:flex-row">
            <Field>
              <FieldLabel htmlFor="platform-access-email">E-mail</FieldLabel>
              <Input
                id="platform-access-email"
                type="email"
                autoComplete="off"
                className="h-11"
                value={email}
                required
                disabled={saving}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field className="sm:w-auto">
              <FieldLabel htmlFor="platform-access-role">Rolle</FieldLabel>
              <RoleSelect
                id="platform-access-role"
                value={role}
                disabled={saving}
                onChange={setRole}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Giv adgang
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function RemoveMemberButton({ member }: { member: Member }) {
  const remove = useMutation(api.platform.members.remove);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await remove({ memberId: member.id });
      toast.success(`Platformadgangen er fjernet for ${member.name}`);
      setOpen(false);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Adgangen kunne ikke fjernes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label={`Fjern platformadgang for ${member.name}`}
          />
        }
      >
        <Trash2Icon aria-hidden="true" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Fjern adgang for {member.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Brugeren mister adgang til platformadministrationen, og igangværende
            supportadgang stopper.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Fjern adgang
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function MemberRoleCell({ member }: { member: Member }) {
  const setRole = useMutation(api.platform.members.setRole);
  const [saving, setSaving] = useState(false);

  async function change(role: PlatformRole) {
    setSaving(true);
    try {
      await setRole({ memberId: member.id, role });
      toast.success(`${member.name} er nu ${roleLabel(role).toLocaleLowerCase("da")}`);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Rollen kunne ikke ændres. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <RoleSelect
      value={member.role}
      disabled={saving}
      onChange={(role) => void change(role)}
    />
  );
}

export function PlatformAccessSettings() {
  const role = usePlatformRole();
  const members = useQuery(api.platform.members.list);
  const canEdit = role === "owner";

  if (members === undefined) {
    return <Skeleton className="h-40 w-full max-w-3xl" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Platformbrugere</CardTitle>
          <CardDescription>
            Ejere kan oprette og suspendere organisationer og ændre
            abonnementer. Support kan se organisationer og starte supportadgang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Navn</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Rolle</TableHead>
                {canEdit ? (
                  <TableHead>
                    <span className="sr-only">Handlinger</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const editable = canEdit && !member.isCurrentUser;
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      {member.name}
                      {member.isCurrentUser ? (
                        <span className="text-muted-foreground"> (dig)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>
                      {editable ? (
                        <MemberRoleCell member={member} />
                      ) : (
                        roleLabel(member.role)
                      )}
                    </TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        {editable ? (
                          <RemoveMemberButton member={member} />
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!canEdit ? (
            <p className="mt-4 text-sm text-muted-foreground">
              Kun platformejere kan ændre adgang.
            </p>
          ) : null}
        </CardContent>
      </Card>
      {canEdit ? <AddMemberCard /> : null}
    </div>
  );
}
