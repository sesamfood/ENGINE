"use client";

import { MailPlusIcon, Trash2Icon, UserRoundIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth-client";
import { api } from "@/convex/_generated/api";
import { usePermission } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrganizationRole } from "@/lib/auth-permissions";

type Member = {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; image?: string | null };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
};

const roleLabels: Record<OrganizationRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  member: "Medlem",
};

const roles = Object.keys(roleLabels) as OrganizationRole[];
const roleItems = roles.map((role) => ({
  value: role,
  label: roleLabels[role],
}));

type LocationAccessRow = {
  userId: string;
  scope: "all" | "selected";
  locationIds: Id<"locations">[];
};

type LocationAccessOption = {
  id: Id<"locations">;
  name: string;
};

function MemberLocationPicker({
  userId,
  access,
  locations,
  disabled,
  setAccess,
}: {
  userId: string;
  access?: LocationAccessRow;
  locations: LocationAccessOption[];
  disabled: boolean;
  setAccess: (args: {
    userId: string;
    scope: "all" | "selected";
    locationIds: Id<"locations">[];
  }) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const scope = access?.scope ?? "all";
  const selectedIds = access?.locationIds ?? [];
  const label =
    scope === "all"
      ? "Alle lokationer"
      : `${selectedIds.length} lokation${selectedIds.length === 1 ? "" : "er"}`;

  async function save(scopeValue: "all" | "selected", locationIds: Id<"locations">[]) {
    setSaving(true);
    try {
      await setAccess({ userId, scope: scopeValue, locationIds });
      toast.success("Lokationerne er opdateret");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lokationerne kunne ikke opdateres");
    } finally {
      setSaving(false);
    }
  }

  function toggleLocation(id: Id<"locations">, checked: boolean) {
    const next = checked
      ? [...new Set([...selectedIds, id])]
      : selectedIds.filter((value) => value !== id);
    if (!next.length) {
      toast.error("Vælg mindst én lokation");
      return;
    }
    void save("selected", next);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="h-10 min-w-40 justify-start"
            disabled={disabled || saving}
            aria-label="Lokationer"
          />
        }
      >
        <span className="truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <FieldSet className="gap-2">
          <FieldLegend variant="label">Lokationer</FieldLegend>
          <label className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
            <Checkbox
              checked={scope === "all"}
              disabled={saving}
              onCheckedChange={(checked) => {
                if (checked === true) void save("all", []);
              }}
            />
            <span>Alle lokationer</span>
          </label>
          {locations.map((location) => (
            <label
              key={location.id}
              className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
            >
              <Checkbox
                checked={scope === "selected" && selectedIds.includes(location.id)}
                disabled={saving}
                onCheckedChange={(checked) => toggleLocation(location.id, checked === true)}
              />
              <span className="truncate">{location.name}</span>
            </label>
          ))}
        </FieldSet>
      </PopoverContent>
    </Popover>
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function MemberManagement() {
  const allowed = usePermission("members.manage");
  const { data: session } = authClient.useSession();
  const { data: organization, isPending: organizationPending } =
    authClient.useActiveOrganization();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [pendingId, setPendingId] = useState<string>();
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("member");
  const [inviting, setInviting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const kioskAccounts = useQuery(api.kiosk.listAccounts, allowed ? {} : "skip");
  const deleteKioskAccount = useMutation(api.kiosk.deleteAccount);
  const memberLocationAccess = useQuery(
    api.access.listMemberLocationAccess,
    allowed ? {} : "skip",
  );
  const updateMemberLocationAccess = useMutation(
    api.access.setMemberLocationAccess,
  );
  const organizationId = organization?.id;

  useEffect(() => {
    if (!organizationId || !allowed) return;
    let active = true;

    void (async () => {
      try {
        const [memberResult, invitationResult] = await Promise.all([
          authClient.organization.listMembers({
            query: { organizationId, limit: 100 },
          }),
          authClient.organization.listInvitations({
            query: { organizationId },
          }),
        ]);
        if (!active) return;

        if (memberResult.error || invitationResult.error) {
          setError("Brugere og invitationer kunne ikke indlæses.");
          return;
        }

        setError(undefined);
        setMembers(memberResult.data?.members ?? []);
        setInvitations(
          (invitationResult.data ?? []).filter(
            (invitation) => invitation.status === "pending",
          ),
        );
      } catch {
        if (active) {
          setError("Brugere og invitationer kunne ikke indlæses.");
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [allowed, organizationId, refreshKey]);

  async function invite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!organization) return;

    const formElement = event.currentTarget;
    setInviting(true);

    try {
      const form = new FormData(formElement);
      const result = await authClient.organization.inviteMember({
        email: String(form.get("email")),
        role: inviteRole,
        organizationId: organization.id,
        resend: true,
      });

      if (result.error) {
        toast.error("Invitationen kunne ikke sendes");
        return;
      }

      formElement.reset();
      setInviteRole("member");
      toast.success("Invitationen er sendt");
      setRefreshKey((value) => value + 1);
    } catch {
      toast.error("Invitationen kunne ikke sendes. Kontrollér forbindelsen");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: Member, role: OrganizationRole) {
    if (!organization) return;
    setPendingId(member.id);
    try {
      const result = await authClient.organization.updateMemberRole({
        memberId: member.id,
        role,
        organizationId: organization.id,
      });

      if (result.error) {
        toast.error("Rollen kunne ikke ændres");
        return;
      }

      toast.success("Rollen er opdateret");
      setRefreshKey((value) => value + 1);
    } catch {
      toast.error("Rollen kunne ikke ændres. Kontrollér forbindelsen");
    } finally {
      setPendingId(undefined);
    }
  }

  async function removeMember(member: Member) {
    if (!organization) return;
    setPendingId(member.id);
    try {
      const kioskAccount = kioskAccounts?.find((account) => account.userId === member.userId);
      if (kioskAccount) {
        await deleteKioskAccount({ memberId: kioskAccount.memberId });
      } else {
        const result = await authClient.organization.removeMember({
          memberIdOrEmail: member.id,
          organizationId: organization.id,
        });
        if (result.error) {
          toast.error("Brugeren kunne ikke fjernes");
          return;
        }
      }

      toast.success("Brugeren er fjernet");
      setRefreshKey((value) => value + 1);
    } catch {
      toast.error("Brugeren kunne ikke fjernes. Kontrollér forbindelsen");
    } finally {
      setPendingId(undefined);
    }
  }

  async function cancelInvitation(invitation: Invitation) {
    setPendingId(invitation.id);
    try {
      const result = await authClient.organization.cancelInvitation({
        invitationId: invitation.id,
      });

      if (result.error) {
        toast.error("Invitationen kunne ikke annulleres");
        return;
      }

      toast.success("Invitationen er annulleret");
      setRefreshKey((value) => value + 1);
    } catch {
      toast.error(
        "Invitationen kunne ikke annulleres. Kontrollér forbindelsen",
      );
    } finally {
      setPendingId(undefined);
    }
  }

  if (organizationPending) {
    return <Skeleton className="h-80 w-full" />;
  }

  if (!organization || !allowed) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun administratorer kan administrere organisationens brugere.
        </AlertDescription>
      </Alert>
    );
  }

  const adminCount = members.filter((member) => member.role === "admin").length;
  const accessRows = memberLocationAccess?.access ?? [];
  const assignmentLocations = memberLocationAccess?.locations ?? [];

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>Inviter bruger</CardTitle>
            <HelpTooltip
              label="Inviter bruger"
              content="Brugeren modtager et link på e-mail og bliver medlem efter accept."
            />
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={invite}>
            <FieldGroup className="md:flex-row md:items-end">
              <Field>
                <FieldLabel htmlFor="invite-email">E-mail</FieldLabel>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field className="md:max-w-52">
                <FieldLabel htmlFor="invite-role">Rolle</FieldLabel>
                <Select
                  items={roleItems}
                  value={inviteRole}
                  onValueChange={(role) => {
                    if (role) setInviteRole(role);
                  }}
                >
                  <SelectTrigger id="invite-role" className="h-10 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {roles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabels[role]}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button type="submit" size="lg" disabled={inviting}>
                {inviting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <MailPlusIcon data-icon="inline-start" />
                )}
                Send invitation
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Brugere</CardTitle>
          <CardDescription>{members.length} aktive brugere</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading || memberLocationAccess === undefined ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bruger</TableHead>
                  <TableHead>Rolle</TableHead>
                  <TableHead>Lokationer</TableHead>
                  <TableHead className="w-16">
                    <span className="sr-only">Handlinger</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const kioskAccount = kioskAccounts?.find((account) => account.userId === member.userId);
                  const isCurrentUser = member.userId === session?.user.id;
                  const isLastAdmin =
                    member.role === "admin" && adminCount === 1;
                  const disabled =
                    isCurrentUser || isLastAdmin || pendingId === member.id;

                  return (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            {member.user.image ? (
                              <AvatarImage
                                src={member.user.image}
                                alt={member.user.name}
                              />
                            ) : null}
                            <AvatarFallback>
                              {initials(member.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="grid min-w-0">
                            <span className="truncate font-medium">
                              {member.user.name}
                            </span>
                            <span className="truncate text-sm text-muted-foreground">{kioskAccount ? `${kioskAccount.username} · ${kioskAccount.locationName}` : member.user.email}</span>
                          </div>
                          {kioskAccount ? <Badge>Kiosk</Badge> : null}
                          {isCurrentUser ? (
                            <Badge variant="secondary">Dig</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          items={roleItems}
                          value={member.role}
                          onValueChange={(role) =>
                            void changeRole(member, role as OrganizationRole)
                          }
                          disabled={disabled}
                        >
                          <SelectTrigger aria-label={`Rolle for ${member.user.name}`} className="h-10 w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {roles.map((role) => (
                                <SelectItem key={role} value={role}>
                                  {roleLabels[role]}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {kioskAccount ? (
                          <LocationField
                            locations={assignmentLocations}
                            value={kioskAccount.locationId}
                            locked
                            lockedName={kioskAccount.locationName}
                            className="h-10! min-w-40"
                          />
                        ) : (
                          <MemberLocationPicker
                            userId={member.userId}
                            access={accessRows.find((row) => row.userId === member.userId)}
                            locations={assignmentLocations}
                            disabled={memberLocationAccess === undefined}
                            setAccess={(args) => updateMemberLocationAccess(args)}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-lg"
                                aria-label={`Fjern ${member.user.name}`}
                                disabled={disabled}
                              />
                            }
                          >
                            <Trash2Icon />
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Fjern bruger?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {member.user.name} mister straks adgangen til
                                organisationen.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                Behold bruger
                              </AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => void removeMember(member)}
                              >
                                Fjern bruger
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>Afventende invitationer</CardTitle>
            <HelpTooltip
              label="Afventende invitationer"
              content="Invitationer udløber automatisk efter syv dage."
            />
          </div>
        </CardHeader>
        <CardContent>
          {invitations.length ? (
            <div className="flex flex-col gap-2">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex min-h-14 items-center gap-3 rounded-lg border px-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{invitation.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {roleLabels[invitation.role as OrganizationRole] ??
                        invitation.role}
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-label={`Annuller invitation til ${invitation.email}`}
                          disabled={pendingId === invitation.id}
                        />
                      }
                    >
                      <Trash2Icon />
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Annuller invitation?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          Linket sendt til {invitation.email} holder op med at
                          virke.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Behold invitation</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => void cancelInvitation(invitation)}
                        >
                          Annuller invitation
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserRoundIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen afventende invitationer</EmptyTitle>
                <EmptyDescription>
                  Nye invitationer vises her, indtil de bliver accepteret.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
