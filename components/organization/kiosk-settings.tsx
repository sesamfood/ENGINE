"use client";

import { EyeIcon, EyeOffIcon, KeyRoundIcon, LogOutIcon, MonitorCogIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
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
import { Switch } from "@/components/ui/switch";
import { useAccess, usePermission } from "@/components/app-shell";
import { kioskDestinations, type KioskDestinationId } from "@/lib/kiosk";
import type { SystemOrganizationRole } from "@/lib/auth-permissions";

const roleLabels: Record<SystemOrganizationRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  member: "Medlem",
};
const roles = Object.keys(roleLabels) as SystemOrganizationRole[];

function message(error: unknown) {
  return error instanceof Error ? error.message : "Handlingen kunne ikke gennemføres";
}

type Account = NonNullable<ReturnType<typeof useQuery<typeof api.kiosk.listAccounts>>>[number];

function PasswordInput(props: React.ComponentProps<"input">) {
  const [visible, setVisible] = useState(false);

  return (
    <InputGroup>
      <InputGroupInput {...props} type={visible ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={visible ? "Skjul adgangskode" : "Vis adgangskode"}
          title={visible ? "Skjul adgangskode" : "Vis adgangskode"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

function AccountDialog({
  account,
  locations,
  onClose,
}: {
  account: Account | null;
  locations: { id: Id<"locations">; name: string }[];
  onClose: () => void;
}) {
  const updateAccount = useMutation(api.kiosk.updateAccount);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await updateAccount({
        memberId: account.memberId,
        name: String(form.get("name")),
        locationId: String(form.get("locationId")) as Id<"locations">,
      });
      toast.success("Kioskkontoen er opdateret");
      onClose();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(account)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Redigér kioskkonto</DialogTitle>
          <DialogDescription>Skift kontoens navn eller faste lokation.</DialogDescription>
        </DialogHeader>
        {account ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="edit-kiosk-name">Navn</FieldLabel>
                <Input id="edit-kiosk-name" name="name" defaultValue={account.name} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-kiosk-location">Lokation</FieldLabel>
                <Select name="locationId" defaultValue={account.locationId} items={locations.map((location) => ({ value: location.id, label: location.name }))}>
                  <SelectTrigger id="edit-kiosk-location" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectGroup>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectGroup></SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Annuller</Button>
              <Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}Gem ændringer</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const setPassword = useMutation(api.kiosk.setPassword);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    try {
      await setPassword({ memberId: account.memberId, password: String(form.get("password")) });
      toast.success("Adgangskoden er ændret. Eksisterende sessioner fortsætter.");
      onClose();
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={Boolean(account)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Skift adgangskode</DialogTitle>
          <DialogDescription>Den nye adgangskode bruges ved fremtidige login. Aktive tablets forbliver logget ind.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field><FieldLabel htmlFor="kiosk-new-password">Ny adgangskode</FieldLabel><PasswordInput id="kiosk-new-password" name="password" minLength={12} maxLength={256} autoComplete="new-password" required /></Field>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annuller</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}Skift adgangskode</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function KioskSettings() {
  const access = useAccess();
  const canManageSettings = usePermission("organization.settings");
  const canManageMembers = usePermission("members.manage");
  const canManageRoles = usePermission("roles.manage");
  const settings = useQuery(
    api.kiosk.getAdminSettings,
    canManageSettings ? {} : "skip",
  );
  const accounts = useQuery(
    api.kiosk.listAccounts,
    canManageMembers ? {} : "skip",
  );
  const memberLocationAccess = useQuery(
    api.access.listMemberLocationAccess,
    canManageMembers ? {} : "skip",
  );
  const locations = canManageMembers
    ? memberLocationAccess?.locations
    : undefined;
  const saveSettings = useMutation(api.kiosk.saveSettings);
  const createAccount = useMutation(api.kiosk.createAccount);
  const revokeSessions = useMutation(api.kiosk.revokeAccountSessions);
  const deleteAccount = useMutation(api.kiosk.deleteAccount);
  const [enabledPages, setEnabledPages] = useState<KioskDestinationId[]>([]);
  const [homePage, setHomePage] = useState<KioskDestinationId | "">("");
  const [inactivityEnabled, setInactivityEnabled] = useState(true);
  const [inactivitySeconds, setInactivitySeconds] = useState(60);
  const [settingsPending, setSettingsPending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingId, setPendingId] = useState<string>();
  const [role, setRole] = useState<SystemOrganizationRole>("member");
  const [editing, setEditing] = useState<Account | null>(null);
  const [passwordAccount, setPasswordAccount] = useState<Account | null>(null);

  useEffect(() => {
    if (settings === undefined) return;
    const timeout = window.setTimeout(() => {
      setEnabledPages((settings?.enabledPages ?? []) as KioskDestinationId[]);
      setHomePage((settings?.homePage as KioskDestinationId | undefined) ?? "");
      setInactivityEnabled(settings?.inactivitySeconds !== null);
      setInactivitySeconds(settings?.inactivitySeconds ?? 60);
    });
    return () => window.clearTimeout(timeout);
  }, [settings]);

  if (!access) {
    return <div className="flex flex-col gap-5"><Skeleton className="h-80 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  if (!canManageSettings && !canManageMembers) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til kioskindstillinger eller kioskkonti.</AlertDescription>
      </Alert>
    );
  }

  if (
    (canManageSettings && settings === undefined) ||
    (canManageMembers && (accounts === undefined || locations === undefined))
  ) {
    return <div className="flex flex-col gap-5"><Skeleton className="h-80 w-full" /><Skeleton className="h-72 w-full" /></div>;
  }

  const availableAccounts = accounts ?? [];
  const availableLocations = locations ?? [];
  const availableRoles =
    canManageRoles
      ? roles
      : roles.filter((item) => item !== "admin");
  const availableRoleItems = availableRoles.map((item) => ({
    value: item,
    label: roleLabels[item],
  }));

  const groups = [...new Set(kioskDestinations.map((page) => page.group))];
  const homeItems = kioskDestinations.filter((page) => enabledPages.includes(page.id)).map((page) => ({ value: page.id, label: page.label }));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsPending(true);
    try {
      await saveSettings({ enabledPages, homePage, inactivitySeconds: inactivityEnabled ? inactivitySeconds : null });
      toast.success("Kioskopsætningen er gemt");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSettingsPending(false);
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setCreating(true);
    try {
      await createAccount({
        name: String(form.get("name")),
        username: String(form.get("username")),
        password: String(form.get("password")),
        locationId: String(form.get("locationId")) as Id<"locations">,
        role,
      });
      formElement.reset();
      setRole("member");
      toast.success("Kioskkontoen er oprettet");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(account: Account) {
    setPendingId(account.memberId);
    try {
      const result = await revokeSessions({ memberId: account.memberId });
      toast.success(`${result.revokedSessions} session${result.revokedSessions === 1 ? "" : "er"} blev afsluttet`);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPendingId(undefined);
    }
  }

  async function remove(account: Account) {
    setPendingId(account.memberId);
    try {
      await deleteAccount({ memberId: account.memberId });
      toast.success("Kioskkontoen er slettet");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPendingId(undefined);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {canManageSettings ? <Card>
        <CardHeader><CardTitle>Kiosktilstand</CardTitle><CardDescription>Vælg de sider, kiosker må bruge, deres startside og automatisk nulstilling.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={save} className="flex flex-col gap-6">
            <FieldSet>
              <FieldLegend>Aktiverede sider</FieldLegend>
              <div data-slot="checkbox-group" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {groups.map((group) => <FieldSet key={group} className="rounded-xl border p-4"><FieldLegend variant="label">{group}</FieldLegend>{kioskDestinations.filter((page) => page.group === group).map((page) => <Field key={page.id} orientation="horizontal"><Checkbox id={`page-${page.id}`} checked={enabledPages.includes(page.id)} onCheckedChange={(checked) => {
                  const next = checked ? [...enabledPages, page.id] : enabledPages.filter((id) => id !== page.id);
                  setEnabledPages(next);
                  if (homePage === page.id && !checked) setHomePage("");
                }} /><FieldLabel htmlFor={`page-${page.id}`}>{page.label}</FieldLabel></Field>)}</FieldSet>)}
              </div>
            </FieldSet>
            <FieldGroup className="md:grid md:grid-cols-2">
              <Field><FieldLabel htmlFor="kiosk-home">Startside</FieldLabel><Select items={homeItems} value={homePage || null} onValueChange={(value) => setHomePage((value ?? "") as KioskDestinationId | "")} disabled={!homeItems.length}><SelectTrigger id="kiosk-home" className="w-full"><SelectValue placeholder="Vælg startside" /></SelectTrigger><SelectContent><SelectGroup>{homeItems.map((page) => <SelectItem key={page.value} value={page.value}>{page.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Startsiden skal være blandt de aktiverede sider.</FieldDescription></Field>
              <FieldGroup>
                <Field orientation="horizontal"><FieldContent><FieldTitle>Nulstil ved inaktivitet</FieldTitle><FieldDescription>Sender kiosken tilbage til startsiden og rydder igangværende arbejde.</FieldDescription></FieldContent><Switch checked={inactivityEnabled} onCheckedChange={setInactivityEnabled} /></Field>
                <Field data-disabled={!inactivityEnabled}><FieldLabel htmlFor="kiosk-timeout">Sekunder</FieldLabel><Input id="kiosk-timeout" type="number" min={5} max={3600} value={inactivitySeconds} onChange={(event) => setInactivitySeconds(Number(event.target.value))} disabled={!inactivityEnabled} /></Field>
              </FieldGroup>
            </FieldGroup>
            <Button type="submit" size="lg" className="self-start" disabled={settingsPending}>{settingsPending ? <Spinner data-icon="inline-start" /> : null}Gem kioskopsætning</Button>
          </form>
        </CardContent>
      </Card> : null}

      {canManageMembers ? <>
      <Card>
        <CardHeader><CardTitle>Opret kioskkonto</CardTitle><CardDescription>Kontoen bindes permanent til én lokation og starter altid i kiosktilstand.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={create}>
            <FieldGroup className="md:grid md:grid-cols-2 xl:grid-cols-5">
              <Field><FieldLabel htmlFor="new-kiosk-name">Navn</FieldLabel><Input id="new-kiosk-name" name="name" required /></Field>
              <Field><FieldLabel htmlFor="new-kiosk-username">Brugernavn</FieldLabel><Input id="new-kiosk-username" name="username" autoComplete="off" minLength={3} maxLength={30} required /></Field>
              <Field><FieldLabel htmlFor="new-kiosk-password">Adgangskode</FieldLabel><PasswordInput id="new-kiosk-password" name="password" autoComplete="new-password" minLength={12} maxLength={256} required /></Field>
              <Field><FieldLabel htmlFor="new-kiosk-location">Lokation</FieldLabel><Select name="locationId" items={availableLocations.map((location) => ({ value: location.id, label: location.name }))} required><SelectTrigger id="new-kiosk-location" className="w-full"><SelectValue placeholder="Vælg lokation" /></SelectTrigger><SelectContent><SelectGroup>{availableLocations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
              <Field><FieldLabel htmlFor="new-kiosk-role">Normal rolle</FieldLabel><Select items={availableRoleItems} value={role} onValueChange={(value) => value && setRole(value)}><SelectTrigger id="new-kiosk-role" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{availableRoles.map((item) => <SelectItem key={item} value={item}>{roleLabels[item]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
            </FieldGroup>
            <Button type="submit" size="lg" className="mt-5" disabled={creating || !availableLocations.length}>{creating ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}Opret kioskkonto</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
          <CardHeader><CardTitle>Kioskkonti</CardTitle><CardDescription>{availableAccounts.length} {availableAccounts.length === 1 ? "konto" : "konti"}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {availableAccounts.length ? availableAccounts.map((account) => (
            <div key={account.memberId} className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{account.name}</p><Badge>Kiosk</Badge><Badge variant="secondary">{roleLabels[account.role]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{account.username} · {account.locationName} · {account.activeSessionCount} aktive sessioner</p></div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => setEditing(account)}><PencilIcon data-icon="inline-start" />Redigér</Button>
                <Button type="button" variant="outline" onClick={() => setPasswordAccount(account)}><KeyRoundIcon data-icon="inline-start" />Skift adgangskode</Button>
                <AlertDialog><AlertDialogTrigger render={<Button type="button" variant="outline" disabled={!account.activeSessionCount || pendingId === account.memberId} />}><LogOutIcon data-icon="inline-start" />Log ud på alle enheder</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Log kiosk ud på alle enheder?</AlertDialogTitle><AlertDialogDescription>Alle tablets, der bruger kontoen, skal logge ind igen. Adgangskoden ændres ikke.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuller</AlertDialogCancel><AlertDialogAction onClick={() => void revoke(account)}>Log ud på alle enheder</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
                <AlertDialog><AlertDialogTrigger render={<Button type="button" variant="destructive" disabled={pendingId === account.memberId} />}><Trash2Icon data-icon="inline-start" />Slet</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Slet kioskkonto?</AlertDialogTitle><AlertDialogDescription>Kontoen, dens adgangskode og alle aktive sessioner slettes permanent.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Behold konto</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void remove(account)}>Slet kioskkonto</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
              </div>
            </div>
          )) : <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center"><MonitorCogIcon className="size-6 text-muted-foreground" /><p className="font-medium">Ingen kioskkonti endnu</p><p className="text-sm text-muted-foreground">Gem opsætningen og opret den første konto ovenfor.</p></div>}
        </CardContent>
      </Card>
      <AccountDialog account={editing} locations={availableLocations} onClose={() => setEditing(null)} />
      <PasswordDialog account={passwordAccount} onClose={() => setPasswordAccount(null)} />
      </> : null}
    </div>
  );
}
