"use client";

import { PasswordInput } from "@/components/ui/password-input";

import { getUserErrorMessage } from "@/lib/user-errors";
import { KeyRoundIcon, LayoutDashboardIcon, LogOutIcon, MonitorCogIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
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
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormCardSkeleton } from "@/components/page-skeletons";
import { Spinner } from "@/components/ui/spinner";
import { KioskPinSettings } from "./kiosk-pin-settings";
import { SettingsSwitchField } from "./settings-switch-field";
import { useAccess, useLocationAccess, usePermission } from "@/components/app-shell";
import { useRouter } from "next/navigation";
import {
  kioskDestinations,
  type KioskDestinationId,
} from "@/lib/kiosk";
import type { SystemOrganizationRole } from "@/lib/auth-permissions";
import { featureLabels, type FeatureId } from "@/lib/features";
import type { WidgetRangePreset } from "@/lib/dashboard/types";
import { rangePresetOptions } from "@/components/dashboard/range-selector";

type KioskDashboard = { dashboardId: Id<"dashboards">; preset: WidgetRangePreset };
const kioskPresetItems = rangePresetOptions.filter(
  (option): option is { value: WidgetRangePreset; label: string } => option.value !== "custom",
);

const roleLabels: Record<SystemOrganizationRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  member: "Medlem",
};
const roles = Object.keys(roleLabels) as SystemOrganizationRole[];

type Account = NonNullable<ReturnType<typeof useQuery<typeof api.kiosk.listAccounts>>>[number];


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
      toast.error(getUserErrorMessage(error, "Kioskopsætningen kunne ikke opdateres. Prøv igen."));
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
              <Button type="button" variant="outline" onClick={onClose}>Annullér</Button>
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
      toast.error(getUserErrorMessage(error, "Kioskopsætningen kunne ikke opdateres. Prøv igen."));
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
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Annullér</Button><Button type="submit" disabled={pending}>{pending ? <Spinner data-icon="inline-start" /> : null}Skift adgangskode</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SessionKioskCard({ disabled }: { disabled: boolean }) {
  const { locations } = useLocationAccess();
  const router = useRouter();
  const enter = useMutation(api.kiosk.enterSessionKiosk);
  const [selected, setSelected] = useState<Id<"locations"> | null>(null);
  const [pending, setPending] = useState(false);
  const locationId = selected ?? locations[0]?.id ?? null;

  async function start() {
    if (!locationId) return;
    setPending(true);
    try {
      await enter({ locationId });
      toast.success("Kiosktilstand er startet");
      router.refresh();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Kiosktilstand kunne ikke startes. Prøv igen."));
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start kiosk på denne enhed</CardTitle>
        <CardDescription>
          Din session skifter til kiosktilstand for den valgte lokation. Alle ved enheden kan forlade kiosktilstand og få din adgang.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <Field className="max-w-sm">
            <FieldLabel htmlFor="session-kiosk-location">Lokation</FieldLabel>
            <Select
              value={locationId}
              onValueChange={(value) => setSelected(value as Id<"locations">)}
              items={locations.map((location) => ({ value: location.id, label: location.name }))}
            >
              <SelectTrigger id="session-kiosk-location" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{locations.map((location) => <SelectItem key={location.id} value={location.id}>{location.name}</SelectItem>)}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Button size="lg" onClick={start} disabled={disabled || !locationId || pending}>
            {pending ? <Spinner data-icon="inline-start" /> : <MonitorCogIcon data-icon="inline-start" />}
            Start kiosktilstand
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type DashboardOption = { id: Id<"dashboards">; name: string };

function KioskDashboardDialog({
  open,
  options,
  value,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  options: DashboardOption[];
  value: KioskDashboard[];
  onOpenChange: (open: boolean) => void;
  onApply: (value: KioskDashboard[]) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase("da");
  const visible = options.filter((option) => option.name.toLocaleLowerCase("da").includes(query));
  const allVisibleSelected = visible.length > 0 && visible.every((option) => draft.some((item) => item.dashboardId === option.id));
  const periodFor = (id: Id<"dashboards">) => draft.find((item) => item.dashboardId === id)?.preset;

  function toggle(id: Id<"dashboards">, checked: boolean) {
    setDraft(checked ? [...draft, { dashboardId: id, preset: "today" }] : draft.filter((item) => item.dashboardId !== id));
  }

  function toggleVisible() {
    const ids = new Set(visible.map((option) => option.id));
    setDraft(
      allVisibleSelected
        ? draft.filter((item) => !ids.has(item.dashboardId))
        : [...draft, ...visible.filter((option) => !periodFor(option.id)).map((option) => ({ dashboardId: option.id, preset: "today" as const }))],
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(value);
          setSearch("");
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-(--spacing-viewport-inset) flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dashboards i kiosk</DialogTitle>
          <DialogDescription>Vælg de dashboards, kiosken må vise, og den periode, hvert dashboard altid viser.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 sm:flex-row">
          <InputGroup className="h-11 sm:flex-1">
            <InputGroupAddon><SearchIcon /></InputGroupAddon>
            <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Søg efter dashboard" aria-label="Søg efter dashboard" />
          </InputGroup>
          <Button type="button" variant="outline" className="min-h-11" onClick={toggleVisible} disabled={!visible.length}>
            {allVisibleSelected ? "Fravælg alle" : "Vælg alle"}
          </Button>
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {visible.length ? (
            <ul className="flex flex-col divide-y rounded-xl border">
              {visible.map((option) => {
                const preset = periodFor(option.id);
                return (
                  <li key={option.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4">
                    <Field orientation="horizontal" className="min-h-11 flex-1">
                      <Checkbox id={`kiosk-dashboard-${option.id}`} checked={Boolean(preset)} onCheckedChange={(checked) => toggle(option.id, checked)} />
                      <FieldLabel htmlFor={`kiosk-dashboard-${option.id}`} className="min-w-0 break-words">{option.name}</FieldLabel>
                    </Field>
                    <Select
                      items={kioskPresetItems}
                      value={preset ?? null}
                      disabled={!preset}
                      onValueChange={(next) => next && setDraft(draft.map((item) => item.dashboardId === option.id ? { ...item, preset: next } : item))}
                    >
                      <SelectTrigger className="h-11 w-full sm:w-44" aria-label={`Periode for ${option.name}`}>
                        <SelectValue placeholder="Ikke valgt" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {kioskPresetItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{options.length ? "Ingen dashboards matcher søgningen." : "Der er ingen dashboards endnu."}</p>
          )}
        </div>
        <DialogFooter className="items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{draft.length} af {options.length} valgt</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>Annullér</Button>
            <Button type="button" className="min-h-11" disabled={!draft.length} onClick={() => { onApply(draft); onOpenChange(false); }}>Anvend</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KioskSettings() {
  const access = useAccess();
  const canManageSettings = usePermission("organization.settings");
  const canManageMembers = usePermission("members.manage");
  const canManageRoles = usePermission("roles.manage");
  const canManageAccounts =
    canManageMembers && canManageRoles && access?.locationScope.all === true;
  const settings = useQuery(
    api.kiosk.getAdminSettings,
    canManageSettings ? {} : "skip",
  );
  const accounts = useQuery(
    api.kiosk.listAccounts,
    canManageAccounts ? {} : "skip",
  );
  const memberLocationAccess = useQuery(
    api.access.listMemberLocationAccess,
    canManageAccounts ? {} : "skip",
  );
  const dashboardOptions = useQuery(
    api.kiosk.listDashboardOptions,
    canManageSettings ? {} : "skip",
  );
  const locations = canManageAccounts
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
  const [allowLeavingStartOfDay, setAllowLeavingStartOfDay] = useState(false);
  const [pinFeatures, setPinFeatures] = useState<FeatureId[]>([]);
  const [kioskDashboards, setKioskDashboards] = useState<KioskDashboard[]>([]);
  const [dashboardDialogOpen, setDashboardDialogOpen] = useState(false);
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
      setAllowLeavingStartOfDay(settings?.allowLeavingStartOfDay ?? false);
      setPinFeatures((settings?.pinFeatures ?? []) as FeatureId[]);
    });
    return () => window.clearTimeout(timeout);
  }, [settings]);

  useEffect(() => {
    if (settings === undefined || dashboardOptions === undefined) return;
    const timeout = window.setTimeout(() => {
      // Settings saved before dashboards could be chosen show every dashboard with its own period.
      setKioskDashboards(
        settings?.dashboards?.filter((item) => dashboardOptions.some((option) => option.id === item.dashboardId))
          ?? dashboardOptions.map((option) => ({
            dashboardId: option.id,
            preset: kioskPresetItems.find((item) => item.value === option.defaultPreset)?.value ?? "today",
          })),
      );
    });
    return () => window.clearTimeout(timeout);
  }, [settings, dashboardOptions]);

  if (!access) {
    return <div className="flex flex-col gap-5"><FormCardSkeleton /><FormCardSkeleton /></div>;
  }

  if (!canManageSettings && !canManageAccounts) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til kioskindstillinger eller kioskkonti.</AlertDescription>
      </Alert>
    );
  }

  if (
    (canManageSettings && (settings === undefined || dashboardOptions === undefined)) ||
    (canManageAccounts && (accounts === undefined || locations === undefined))
  ) {
    return <div className="flex flex-col gap-5"><FormCardSkeleton /><FormCardSkeleton /></div>;
  }

  const availableAccounts = accounts ?? [];
  const availableLocations = locations ?? [];
  const canManageKioskLocations = access.locationScope.all;
  const availableRoles = canManageRoles ? roles : [];
  const availableRoleItems = availableRoles.map((item) => ({
    value: item,
    label: roleLabels[item],
  }));

  // Modules turned off for the organization are hidden.
  const visiblePages = kioskDestinations.filter(
    (page) =>
      !access.disabledFeatures.includes(page.feature) &&
      (page.feature !== "woltOrders" || access.woltEnabled),
  );
  const features = [...new Set(visiblePages.map((page) => page.feature))];
  const featureEnabled = (feature: FeatureId) =>
    kioskDestinations.some((page) => page.feature === feature && enabledPages.includes(page.id));
  const homeItems = visiblePages.filter((page) => enabledPages.includes(page.id)).map((page) => ({ value: page.id, label: page.label }));

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSettingsPending(true);
    try {
      await saveSettings({ enabledPages, homePage, inactivitySeconds: inactivityEnabled ? inactivitySeconds : null, allowLeavingStartOfDay, pinFeatures: pinFeatures.filter(featureEnabled), dashboards: kioskDashboards });
      toast.success("Kioskopsætningen er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Kioskopsætningen kunne ikke opdateres. Prøv igen."));
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
      toast.error(getUserErrorMessage(error, "Kioskopsætningen kunne ikke opdateres. Prøv igen."));
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
      toast.error(getUserErrorMessage(error, "Kioskopsætningen kunne ikke opdateres. Prøv igen."));
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
      toast.error(getUserErrorMessage(error, "Kioskopsætningen kunne ikke opdateres. Prøv igen."));
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
                {features.map((feature) => (
                  <FieldSet key={feature} appearance="outline">
                    <FieldLegend variant="label">{featureLabels[feature]}</FieldLegend>
                    {visiblePages
                      .filter((page) => page.feature === feature)
                      .map((page) => (
                        <Field key={page.id} orientation="horizontal">
                          <Checkbox
                            id={`page-${page.id}`}
                            checked={enabledPages.includes(page.id)}
                            onCheckedChange={(checked) => {
                              const next = checked
                                ? [...enabledPages, page.id]
                                : enabledPages.filter((id) => id !== page.id);
                              setEnabledPages(next);
                              if (homePage === page.id && !checked) setHomePage("");
                            }}
                          />
                          <FieldLabel htmlFor={`page-${page.id}`}>
                            {page.label}
                          </FieldLabel>
                        </Field>
                      ))}
                    {feature === "dashboard" && enabledPages.includes("dashboard.view") ? (
                      <>
                        <FieldSeparator />
                        <Field>
                          <FieldLabel htmlFor="kiosk-dashboards">Dashboards</FieldLabel>
                          <Button id="kiosk-dashboards" type="button" variant="outline" className="min-h-11 justify-start" onClick={() => setDashboardDialogOpen(true)}>
                            <LayoutDashboardIcon data-icon="inline-start" />
                            {kioskDashboards.length} af {dashboardOptions?.length ?? 0} valgt
                          </Button>
                          {kioskDashboards.length ? null : <FieldDescription>Vælg mindst ét dashboard.</FieldDescription>}
                        </Field>
                        <KioskDashboardDialog
                          open={dashboardDialogOpen}
                          options={dashboardOptions ?? []}
                          value={kioskDashboards}
                          onOpenChange={setDashboardDialogOpen}
                          onApply={setKioskDashboards}
                        />
                      </>
                    ) : null}
                    {featureEnabled(feature) ? (
                      <>
                        <FieldSeparator />
                        <Field orientation="horizontal">
                          <Checkbox
                            id={`pin-${feature}`}
                            checked={pinFeatures.includes(feature)}
                            onCheckedChange={(checked) =>
                              setPinFeatures(
                                checked
                                  ? [...pinFeatures, feature]
                                  : pinFeatures.filter((id) => id !== feature),
                              )
                            }
                          />
                          <FieldLabel htmlFor={`pin-${feature}`}>
                            Kræver PIN-kode
                          </FieldLabel>
                        </Field>
                      </>
                    ) : null}
                  </FieldSet>
                ))}
              </div>
            </FieldSet>
            <FieldGroup className="md:grid md:grid-cols-2">
              <Field><FieldLabel htmlFor="kiosk-home">Startside</FieldLabel><Select items={homeItems} value={homePage || null} onValueChange={(value) => setHomePage((value ?? "") as KioskDestinationId | "")} disabled={!homeItems.length}><SelectTrigger id="kiosk-home" className="w-full"><SelectValue placeholder="Vælg startside" /></SelectTrigger><SelectContent><SelectGroup>{homeItems.map((page) => <SelectItem key={page.value} value={page.value}>{page.label}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Startsiden skal være blandt de aktiverede sider.</FieldDescription></Field>
              <FieldGroup>
                <SettingsSwitchField label="Nulstil ved inaktivitet" checked={inactivityEnabled} onCheckedChange={setInactivityEnabled} help={{ label: "Nulstil ved inaktivitet", content: "Sender kiosken tilbage til startsiden og rydder igangværende arbejde." }} />
                <Field data-disabled={!inactivityEnabled}><FieldLabel htmlFor="kiosk-timeout">Sekunder</FieldLabel><Input id="kiosk-timeout" type="number" min={5} max={3600} value={inactivitySeconds} onChange={(event) => setInactivitySeconds(Number(event.target.value))} disabled={!inactivityEnabled} /></Field>
                <SettingsSwitchField label="Tillad andre sider før åbning" checked={allowLeavingStartOfDay} onCheckedChange={setAllowLeavingStartOfDay} help={{ label: "Tillad andre sider før åbning", content: "Kiosken kan forlade åbningsopgaverne og bruge de andre sider, før opgaverne er udført. Ved inaktivitet vender kiosken tilbage til åbningsopgaverne." }} />
              </FieldGroup>
            </FieldGroup>
            <Button type="submit" size="lg" className="self-start" disabled={settingsPending}>{settingsPending ? <Spinner data-icon="inline-start" /> : null}Gem kioskopsætning</Button>
          </form>
        </CardContent>
      </Card> : null}

      {canManageSettings ? <KioskPinSettings /> : null}

      {canManageSettings ? <SessionKioskCard disabled={!settings} /> : null}

      {canManageAccounts ? <>
      {canManageRoles && canManageKioskLocations ? <Card>
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
      </Card> : null}

      <Card>
          <CardHeader><CardTitle>Kioskkonti</CardTitle><CardDescription>{availableAccounts.length} {availableAccounts.length === 1 ? "konto" : "konti"}</CardDescription></CardHeader>
        <CardContent appearance="compact" className="flex flex-col">
          {availableAccounts.length ? availableAccounts.map((account) => (
            <div key={account.memberId} className="flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{account.name}</p><Badge>Kiosk</Badge><Badge variant="secondary">{roleLabels[account.role]}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{account.username} · {account.locationName} · {account.activeSessionCount} aktive sessioner</p></div>
              <div className="flex flex-wrap gap-2">
                {canManageKioskLocations ? <Button type="button" variant="outline" onClick={() => setEditing(account)}><PencilIcon data-icon="inline-start" />Redigér</Button> : null}
                <Button type="button" variant="outline" onClick={() => setPasswordAccount(account)}><KeyRoundIcon data-icon="inline-start" />Skift adgangskode</Button>
                <AlertDialog><AlertDialogTrigger render={<Button type="button" variant="outline" disabled={!account.activeSessionCount || pendingId === account.memberId} />}><LogOutIcon data-icon="inline-start" />Log ud på alle enheder</AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Log kiosk ud på alle enheder?</AlertDialogTitle><AlertDialogDescription>Alle tablets, der bruger kontoen, skal logge ind igen. Adgangskoden ændres ikke.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annullér</AlertDialogCancel><AlertDialogAction onClick={() => void revoke(account)}>Log ud på alle enheder</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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
