"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OrganizationStatusBadge } from "@/components/platform/organization-table";
import {
  unavailableDisplayOptions,
  type UnavailableDisplay,
} from "@/components/platform/platform-settings";
import {
  AccessFields,
  AddOnFields,
  featureIds,
} from "@/components/platform/platform-plans";
import { usePlatformRole } from "@/components/platform/platform-shell";
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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { integrationRegistry, type IntegrationId } from "@/integrations/registry";
import { systemRoleKeys, systemRoleNames, type SystemOrganizationRole } from "@/lib/auth-permissions";
import { getUserErrorMessage } from "@/lib/user-errors";

type Organization = NonNullable<
  FunctionReturnType<typeof api.platform.organizations.get>
>;


function formatDateTime(value: number) {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function roleName(role: string) {
  return systemRoleNames[role as keyof typeof systemRoleNames] ?? role;
}

function ReasonField({
  id,
  value,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Begrundelse</FieldLabel>
      <Textarea
        id={id}
        value={value}
        maxLength={1000}
        required
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function StatusAction({ organization }: { organization: Organization }) {
  const suspend = useMutation(api.platform.lifecycle.suspend);
  const reactivate = useMutation(api.platform.lifecycle.reactivate);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const suspended = organization.status === "suspended";

  async function confirm() {
    setSaving(true);
    try {
      const action = suspended ? reactivate : suspend;
      await action({ organizationId: organization.id });
      toast.success(
        suspended
          ? `${organization.name} er genaktiveret`
          : `${organization.name} er suspenderet`,
      );
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Status kunne ikke ændres. Prøv igen."));
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
            size="lg"
            variant={suspended ? "default" : "destructive"}
          />
        }
      >
        {suspended ? "Genaktivér" : "Suspendér"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {suspended
              ? `Genaktivér ${organization.name}?`
              : `Suspendér ${organization.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {suspended
              ? "Brugere og API-nøgler får adgang igen, og integrationer kan køre igen."
              : "Brugere og API-nøgler mister adgang ved næste anmodning, og integrationer stopper. Data og forbindelser bevares."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
          <AlertDialogAction
            variant={suspended ? "default" : "destructive"}
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {suspended ? "Genaktivér" : "Suspendér"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const roleOptions = systemRoleKeys.map((role) => ({
  value: role,
  label: systemRoleNames[role],
}));

function MoveMemberAction({
  organization,
  member,
}: {
  organization: Organization;
  member: Organization["members"][number];
}) {
  const moveMember = useMutation(api.platform.lifecycle.moveMember);
  const organizations = useQuery(api.platform.organizations.options);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState<SystemOrganizationRole>(
    systemRoleKeys.includes(member.role as SystemOrganizationRole)
      ? (member.role as SystemOrganizationRole)
      : "member",
  );
  const targetOptions = (organizations ?? [])
    .filter((option) => option.id !== organization.id)
    .map((option) => ({ value: option.id, label: option.name }));
  const target = targetOptions.find((option) => option.value === targetId);

  async function confirm() {
    if (!target) return;
    setSaving(true);
    try {
      await moveMember({ memberId: member.id, organizationId: target.value, role });
      toast.success(`${member.name} er flyttet til ${target.label}`);
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Brugeren kunne ikke flyttes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant="outline" />}>
        Flyt
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Flyt {member.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Brugeren forlader {organization.name} og mister sin lokationsadgang
            her. I den nye organisation får brugeren adgang efter den valgte
            rolle.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`move-${member.id}-organization`}>
              Organisation
            </FieldLabel>
            <Select
              items={targetOptions}
              value={targetId}
              disabled={saving || organizations === undefined}
              onValueChange={(value) => setTargetId(value as string)}
            >
              <SelectTrigger
                id={`move-${member.id}-organization`}
                className="h-11! w-full"
              >
                <SelectValue placeholder="Vælg organisation" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {targetOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor={`move-${member.id}-role`}>Rolle</FieldLabel>
            <Select
              items={roleOptions}
              value={role}
              disabled={saving}
              onValueChange={(value) => setRole(value as SystemOrganizationRole)}
            >
              <SelectTrigger id={`move-${member.id}-role`} className="h-11! w-full">
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
          </Field>
        </FieldGroup>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving || !target}
            onClick={() => void confirm()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Flyt
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function InviteAdminCard({ organizationId }: { organizationId: string }) {
  const inviteAdmin = useMutation(api.platform.lifecycle.inviteAdmin);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await inviteAdmin({ organizationId, email });
      toast.success(`Invitationen er sendt til ${email.trim()}`);
      setEmail("");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Invitationen kunne ikke sendes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader>
          <CardTitle>Invitér Administrator</CardTitle>
          <CardDescription>
            Personen får en invitation, der udløber om syv dage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="platform-invite-email">E-mail</FieldLabel>
              <Input
                id="platform-invite-email"
                type="email"
                autoComplete="off"
                value={email}
                required
                disabled={saving}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Send invitation
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function ConfirmAction({
  label,
  title,
  description,
  destructive,
  onConfirm,
}: {
  label: string;
  title: string;
  description: string;
  destructive?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await onConfirm();
      setOpen(false);
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
            variant={destructive ? "destructive" : "outline"}
          />
        }
      >
        {label}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? "destructive" : "default"}
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const testStatusLabels = {
  copying: "Kopierer",
  ready: "Klar",
  deleting: "Slettes",
} as const;

function TestOrganizationCard({
  organization,
  testOrganization,
}: {
  organization: Organization;
  testOrganization: FunctionReturnType<
    typeof api.platform.testOrganizations.get
  >;
}) {
  const role = usePlatformRole();
  const create = useMutation(api.platform.testOrganizations.create);
  const reset = useMutation(api.platform.testOrganizations.reset);
  const remove = useMutation(api.platform.testOrganizations.remove);

  async function run(
    action: () => Promise<unknown>,
    success: string,
    failure: string,
  ) {
    try {
      await action();
      toast.success(success);
    } catch (error) {
      toast.error(getUserErrorMessage(error, failure));
    }
  }

  if (testOrganization.kind === "test") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Testorganisation</CardTitle>
          <CardDescription>
            Kopi af {testOrganization.source.name}. Brugere fra{" "}
            {testOrganization.source.name} åbner den fra deres profilmenu og har
            samme rolle og lokationer som dér.
          </CardDescription>
        </CardHeader>
        <CardFooter className="mt-auto">
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={`/platform/organizations/${testOrganization.source.id}`}
              />
            }
          >
            Gå til {testOrganization.source.name}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const test = testOrganization.test;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Testorganisation</CardTitle>
        <CardDescription>
          En kopi af organisationens data, filer og integrationsnøgler, hvor
          Brugere kan afprøve ændringer. Kopien sender ikke e-mails eller data
          til andre systemer, og Wolt kopieres kun som historik.
        </CardDescription>
      </CardHeader>
      {test ? (
        <CardContent>
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/platform/organizations/${test.id}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {test.name}
              </Link>
              <Badge
                variant={test.status === "ready" ? "secondary" : "outline"}
              >
                {test.status === "ready" ? null : (
                  <Spinner data-icon="inline-start" />
                )}
                {testStatusLabels[test.status]}
              </Badge>
            </div>
            {test.copiedAt ? (
              <span className="text-muted-foreground">
                Kopieret {formatDateTime(test.copiedAt)}
              </span>
            ) : null}
          </div>
        </CardContent>
      ) : null}
      {role === "owner" ? (
        <CardFooter className="mt-auto">
          <div className="flex flex-wrap gap-2">
            {!test ? (
              <ConfirmAction
                label="Opret testorganisation"
                title={`Opret testorganisation for ${organization.name}?`}
                description="Alle data og filer kopieres. Det kan tage nogle minutter, og testorganisationen kan først åbnes, når kopien er klar."
                onConfirm={() =>
                  run(
                    () => create({ organizationId: organization.id }),
                    "Testorganisationen kopieres",
                    "Testorganisationen kunne ikke oprettes. Prøv igen.",
                  )
                }
              />
            ) : test.status !== "deleting" ? (
              <>
                <ConfirmAction
                  label="Nulstil"
                  title="Nulstil testorganisationen?"
                  description={`Alle ændringer i testorganisationen slettes, og data fra ${organization.name} kopieres igen.`}
                  onConfirm={() =>
                    run(
                      () => reset({ organizationId: organization.id }),
                      "Testorganisationen nulstilles",
                      "Testorganisationen kunne ikke nulstilles. Prøv igen.",
                    )
                  }
                />
                <ConfirmAction
                  label="Slet"
                  destructive
                  title="Slet testorganisationen?"
                  description="Testorganisationen og alle dens data og filer slettes. Det kan ikke fortrydes."
                  onConfirm={() =>
                    run(
                      () => remove({ organizationId: organization.id }),
                      "Testorganisationen slettes",
                      "Testorganisationen kunne ikke slettes. Prøv igen.",
                    )
                  }
                />
              </>
            ) : null}
          </div>
        </CardFooter>
      ) : null}
    </Card>
  );
}

function OverviewTab({ organization }: { organization: Organization }) {
  const role = usePlatformRole();
  const testOrganization = useQuery(api.platform.testOrganizations.get, {
    organizationId: organization.id,
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const canMove = role === "owner" && testOrganization?.kind === "source";
  const invitations = organization.invitations.filter(
    (invitation) => invitation.expiresAt > now,
  );
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Brugere</CardTitle>
        </CardHeader>
        <CardContent>
          {organization.members.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Navn</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Rolle</TableHead>
                  {canMove ? <TableHead className="w-0" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {organization.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{roleName(member.role)}</TableCell>
                    {canMove ? (
                      <TableCell>
                        <MoveMemberAction organization={organization} member={member} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Organisationen har endnu ingen Brugere.
            </p>
          )}
          {invitations.length ? (
            <div className="mt-5 flex flex-col gap-2">
              <h3 className="text-sm font-medium">Afventende invitationer</h3>
              <ul className="flex flex-col gap-1 text-sm">
                {invitations.map((invitation) => (
                  <li key={invitation.id}>
                    {invitation.email} · {roleName(invitation.role)} · udløber{" "}
                    {formatDateTime(invitation.expiresAt)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
      {role === "owner" && testOrganization?.kind === "source" ? (
        <InviteAdminCard organizationId={organization.id} />
      ) : null}
      {testOrganization ? (
        <TestOrganizationCard
          organization={organization}
          testOrganization={testOrganization}
        />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Lokationer</CardTitle>
        </CardHeader>
        <CardContent>
          {organization.locations.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {organization.locations.map((location) => (
                <li key={location.id}>{location.name}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Ingen lokationer.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Integrationer</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {integrationRegistry.map((entry) => {
              const state = organization.integrations.find(
                (integration) => integration.id === entry.id,
              );
              return (
                <li key={entry.id} className="flex items-center justify-between gap-3">
                  {entry.name}
                  <Badge variant="secondary">
                    {!state?.entitled
                      ? "Ikke tilgængelig"
                      : state.enabled
                        ? "Aktiveret"
                        : "Deaktiveret"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function EntitlementsTab({ organization }: { organization: Organization }) {
  const role = usePlatformRole();
  const setEntitlements = useMutation(api.platform.entitlements.setEntitlements);
  const plans = useQuery(api.platform.plans.list);
  const allAddOns = useQuery(api.platform.addOns.list);
  const [features, setFeatures] = useState(() =>
    featureIds.filter(
      (feature) => !organization.nonEntitledFeatures.includes(feature),
    ),
  );
  const [integrations, setIntegrations] = useState<IntegrationId[]>(
    organization.entitledIntegrations,
  );
  const [planId, setPlanId] = useState<string>(organization.planId ?? "none");
  const [addOnIds, setAddOnIds] = useState(organization.addOnIds);
  const [unavailableDisplay, setUnavailableDisplay] = useState<
    UnavailableDisplay | "default"
  >(organization.unavailableDisplay ?? "default");
  const [saving, setSaving] = useState(false);
  const canEdit = role === "owner";
  const plan = plans?.find((item) => item.id === planId);
  const planAddOns = (allAddOns ?? []).filter((addOn) =>
    plan?.addOnIds.includes(addOn.id),
  );
  const selectedAddOns = planAddOns.filter((addOn) =>
    addOnIds.includes(addOn.id),
  );
  // What the organization gets from the plan and its selected add-ons.
  const planAccess = plan
    ? {
        features: [
          ...new Set([plan, ...selectedAddOns].flatMap((item) => item.features)),
        ],
        integrations: [
          ...new Set(
            [plan, ...selectedAddOns].flatMap((item) => item.integrations),
          ),
        ],
      }
    : null;
  const planOptions = [
    { value: "none", label: "Ingen plan (tilpasset)" },
    ...(plans ?? [])
      .filter((item) => !item.deprecated || item.id === organization.planId)
      .map((item) => ({
        value: item.id,
        label: item.deprecated ? `${item.name} (udfaset)` : item.name,
      })),
  ];
  const defaultLabel = unavailableDisplayOptions.find(
    (option) => option.value === organization.defaultUnavailableDisplay,
  )?.label;
  const displayOptions = [
    { value: "default", label: `Følg standard (${defaultLabel})` },
    ...unavailableDisplayOptions,
  ];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await setEntitlements({
        organizationId: organization.id,
        features: planAccess?.features ?? features,
        integrations: planAccess?.integrations ?? integrations,
        planId: plan?.id ?? null,
        addOnIds: selectedAddOns.map((addOn) => addOn.id),
        unavailableDisplay:
          unavailableDisplay === "default" ? null : unavailableDisplay,
      });
      toast.success("Adgangen er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Adgangen kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Funktioner og integrationer</CardTitle>
          <CardDescription>
            Organisationen kan kun bruge det, der er valgt her. Administratorer
            kan stadig selv slå valgte funktioner fra. Data bevares, når adgang
            fjernes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field className="sm:max-w-sm">
              <FieldLabel htmlFor="platform-plan">Plan</FieldLabel>
              <Select
                items={planOptions}
                value={planId}
                disabled={
                  !canEdit ||
                  saving ||
                  plans === undefined ||
                  allAddOns === undefined
                }
                onValueChange={(value) => setPlanId(value as string)}
              >
                <SelectTrigger id="platform-plan" className="h-11! w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {planOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {plan ? (
                <FieldDescription>
                  Planen og de valgte tilkøb styrer funktioner og
                  integrationer. Redigér dem under Indstillinger.
                </FieldDescription>
              ) : null}
            </Field>
            {plan ? (
              <AddOnFields
                idPrefix="platform"
                addOns={planAddOns}
                selected={addOnIds}
                current={organization.addOnIds}
                disabled={!canEdit || saving}
                onChange={setAddOnIds}
              />
            ) : null}
            <AccessFields
              idPrefix="platform"
              features={planAccess?.features ?? features}
              integrations={planAccess?.integrations ?? integrations}
              disabled={!canEdit || saving || plan !== undefined}
              onFeaturesChange={setFeatures}
              onIntegrationsChange={setIntegrations}
              featureNote={(feature) =>
                organization.organizationDisabledFeatures.includes(feature)
                  ? " (slået fra af organisationen)"
                  : undefined
              }
            />
            <Field className="sm:max-w-sm">
              <FieldLabel htmlFor="platform-unavailable-display">
                Funktioner uden for abonnementet
              </FieldLabel>
              <Select
                items={displayOptions}
                value={unavailableDisplay}
                disabled={!canEdit || saving}
                onValueChange={(value) =>
                  setUnavailableDisplay(value as UnavailableDisplay | "default")
                }
              >
                <SelectTrigger
                  id="platform-unavailable-display"
                  className="h-11! w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {displayOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Gælder Administration og integrationer.
              </FieldDescription>
            </Field>
            {canEdit ? null : (
              <FieldDescription>
                Kun platformejere kan ændre adgang.
              </FieldDescription>
            )}
          </FieldGroup>
        </CardContent>
        {canEdit ? (
          <CardFooter>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Gem adgang
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </form>
  );
}

const modeOptions = [
  { value: "view", label: "Kun visning" },
  { value: "full", label: "Fuld adgang" },
];

const hourOptions = Array.from({ length: 8 }, (_, index) => ({
  value: String(index + 1),
  label: index === 0 ? "1 time" : `${index + 1} timer`,
}));

function SupportTab({ organization }: { organization: Organization }) {
  const start = useMutation(api.platform.support.start);
  const [mode, setMode] = useState<"view" | "full">("view");
  const [hours, setHours] = useState("1");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  // Suspended organizations only allow view access.
  const availableModes =
    organization.status === "suspended"
      ? modeOptions.filter((option) => option.value === "view")
      : modeOptions;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await start({
        organizationId: organization.id,
        mode,
        hours: Number(hours),
        reason,
      });
      window.location.assign("/");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Supportadgangen kunne ikke startes. Prøv igen."));
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={submit} className="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Start supportadgang</CardTitle>
            <CardDescription>
              Du arbejder i organisationen uden at blive Bruger. Organisationen
              kan se starten, begrundelsen og dine handlinger i sin aktivitetslog.
              Fuld adgang omfatter ikke API-nøgler og roller.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="platform-support-mode">Adgang</FieldLabel>
                  <Select
                    items={availableModes}
                    value={mode}
                    onValueChange={(value) => setMode(value as "view" | "full")}
                  >
                    <SelectTrigger id="platform-support-mode" className="h-11! w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {availableModes.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="platform-support-hours">Varighed</FieldLabel>
                  <Select
                    items={hourOptions}
                    value={hours}
                    onValueChange={(value) => setHours(String(value))}
                  >
                    <SelectTrigger id="platform-support-hours" className="h-11! w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {hourOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <ReasonField
                id="platform-support-reason"
                value={reason}
                disabled={saving}
                onChange={setReason}
              />
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" size="lg" disabled={saving || !reason.trim()}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Start support
            </Button>
          </CardFooter>
        </Card>
      </form>
      <Card>
        <CardHeader>
          <CardTitle>Tidligere supportadgange</CardTitle>
        </CardHeader>
        <CardContent>
          {organization.supportGrants.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Platformbruger</TableHead>
                  <TableHead>Adgang</TableHead>
                  <TableHead>Start</TableHead>
                  <TableHead>Slut</TableHead>
                  <TableHead>Begrundelse</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organization.supportGrants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>{grant.platformUserName}</TableCell>
                    <TableCell>
                      {grant.mode === "view" ? "Kun visning" : "Fuld adgang"}
                    </TableCell>
                    <TableCell>{formatDateTime(grant.startedAt)}</TableCell>
                    <TableCell>
                      {formatDateTime(grant.endedAt ?? grant.expiresAt)}
                    </TableCell>
                    <TableCell className="whitespace-normal">{grant.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              Der har ikke været supportadgang til organisationen.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AuditList({
  title,
  rows,
}: {
  title: string;
  rows: Organization["platformAudit"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <ul className="flex flex-col gap-3 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-0.5">
                <span className="font-medium">{row.summary}</span>
                <span className="text-muted-foreground">
                  {row.actorName} · {formatDateTime(row.at)}
                </span>
                {row.reason ? (
                  <span className="text-muted-foreground">
                    Begrundelse: {row.reason}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen aktivitet.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function PlatformOrganizationDetail({
  organizationId,
}: {
  organizationId: string;
}) {
  const role = usePlatformRole();
  const organization = useQuery(api.platform.organizations.get, {
    organizationId,
  });

  if (organization === undefined) {
    return <Skeleton className="mx-auto h-96 w-full max-w-(--container-page)" />;
  }

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {organization.name}
            </h1>
            <OrganizationStatusBadge status={organization.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {organization.slug} · oprettet {formatDateTime(organization.createdAt)}
            {organization.plan ? ` · ${organization.plan}` : ""}
          </p>
        </div>
        {role === "owner" ? <StatusAction organization={organization} /> : null}
      </div>
      <Tabs defaultValue="overview" appearance="spaced">
        <TabsList>
          <TabsTrigger value="overview">Overblik</TabsTrigger>
          <TabsTrigger value="features">Funktioner</TabsTrigger>
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="activity">Aktivitet</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab organization={organization} />
        </TabsContent>
        <TabsContent value="features">
          <EntitlementsTab
            key={`${organization.id}:${organization.planId}:${organization.addOnIds.join()}:${organization.unavailableDisplay}:${organization.nonEntitledFeatures.join()}:${organization.entitledIntegrations.join()}`}
            organization={organization}
          />
        </TabsContent>
        <TabsContent value="support">
          <SupportTab organization={organization} />
        </TabsContent>
        <TabsContent value="activity">
          <div className="grid gap-5 lg:grid-cols-2">
            <AuditList title="Platformaktivitet" rows={organization.platformAudit} />
            <AuditList
              title="Organisationens aktivitet"
              rows={organization.organizationAudit}
            />
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
