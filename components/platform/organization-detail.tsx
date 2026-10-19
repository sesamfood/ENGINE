"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OrganizationStatusBadge } from "@/components/platform/organization-table";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
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
import { systemRoleNames } from "@/lib/auth-permissions";
import { featureLabels, type FeatureId } from "@/lib/features";
import { getUserErrorMessage } from "@/lib/user-errors";

type Organization = NonNullable<
  FunctionReturnType<typeof api.platform.organizations.get>
>;

const featureIds = Object.keys(featureLabels) as FeatureId[];

function formatDateTime(value: number) {
  return new Date(value).toLocaleString("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function roleName(role: string) {
  return systemRoleNames[role as keyof typeof systemRoleNames] ?? role;
}

function toggle<T>(values: T[], value: T, checked: boolean) {
  return checked
    ? [...new Set([...values, value])]
    : values.filter((item) => item !== value);
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
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const suspended = organization.status === "suspended";

  async function confirm() {
    setSaving(true);
    try {
      const action = suspended ? reactivate : suspend;
      await action({ organizationId: organization.id, reason });
      toast.success(
        suspended
          ? `${organization.name} er genaktiveret`
          : `${organization.name} er suspenderet`,
      );
      setOpen(false);
      setReason("");
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
        <ReasonField
          id="platform-status-reason"
          value={reason}
          disabled={saving}
          onChange={setReason}
        />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
          <AlertDialogAction
            variant={suspended ? "default" : "destructive"}
            disabled={saving || !reason.trim()}
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

function InviteAdminCard({ organizationId }: { organizationId: string }) {
  const inviteAdmin = useMutation(api.platform.lifecycle.inviteAdmin);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await inviteAdmin({ organizationId, email, reason });
      toast.success(`Invitationen er sendt til ${email.trim()}`);
      setEmail("");
      setReason("");
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
            <ReasonField
              id="platform-invite-reason"
              value={reason}
              disabled={saving}
              onChange={setReason}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving || !reason.trim()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Send invitation
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

function OverviewTab({ organization }: { organization: Organization }) {
  const role = usePlatformRole();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {organization.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{roleName(member.role)}</TableCell>
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
      {role === "owner" ? (
        <InviteAdminCard organizationId={organization.id} />
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
  const [features, setFeatures] = useState(() =>
    featureIds.filter(
      (feature) => !organization.nonEntitledFeatures.includes(feature),
    ),
  );
  const [integrations, setIntegrations] = useState<IntegrationId[]>(
    organization.entitledIntegrations,
  );
  const [plan, setPlan] = useState(organization.plan ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const canEdit = role === "owner";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await setEntitlements({
        organizationId: organization.id,
        features,
        integrations,
        plan,
        reason,
      });
      toast.success("Adgangen er gemt");
      setReason("");
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
            <FieldSet>
              <FieldLegend variant="label">Funktioner</FieldLegend>
              <FieldGroup appearance="dense" className="grid sm:grid-cols-2">
                {featureIds.map((feature) => (
                  <Field key={feature} orientation="horizontal">
                    <Checkbox
                      id={`platform-feature-${feature}`}
                      checked={features.includes(feature)}
                      disabled={!canEdit || saving}
                      onCheckedChange={(checked) =>
                        setFeatures((current) =>
                          toggle(current, feature, checked === true),
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`platform-feature-${feature}`}
                      appearance="regular"
                    >
                      {featureLabels[feature]}
                      {organization.organizationDisabledFeatures.includes(feature)
                        ? " (slået fra af organisationen)"
                        : ""}
                    </FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
            <FieldSet>
              <FieldLegend variant="label">Integrationer</FieldLegend>
              <FieldGroup appearance="dense" className="grid sm:grid-cols-2">
                {integrationRegistry.map((entry) => (
                  <Field key={entry.id} orientation="horizontal">
                    <Checkbox
                      id={`platform-integration-${entry.id}`}
                      checked={integrations.includes(entry.id)}
                      disabled={!canEdit || saving}
                      onCheckedChange={(checked) =>
                        setIntegrations((current) =>
                          toggle(current, entry.id, checked === true),
                        )
                      }
                    />
                    <FieldLabel
                      htmlFor={`platform-integration-${entry.id}`}
                      appearance="regular"
                    >
                      {entry.name}
                    </FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
            <Field className="sm:max-w-sm">
              <FieldLabel htmlFor="platform-plan">Plan</FieldLabel>
              <Input
                id="platform-plan"
                value={plan}
                maxLength={100}
                disabled={!canEdit || saving}
                onChange={(event) => setPlan(event.target.value)}
              />
            </Field>
            {canEdit ? (
              <ReasonField
                id="platform-entitlements-reason"
                value={reason}
                disabled={saving}
                onChange={setReason}
              />
            ) : (
              <FieldDescription>
                Kun platformejere kan ændre adgang.
              </FieldDescription>
            )}
          </FieldGroup>
        </CardContent>
        {canEdit ? (
          <CardFooter>
            <Button type="submit" disabled={saving || !reason.trim()}>
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
            key={`${organization.id}:${organization.plan}:${organization.nonEntitledFeatures.join()}:${organization.entitledIntegrations.join()}`}
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
