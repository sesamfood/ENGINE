"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { SettingsSwitchField } from "@/components/organization/settings-switch-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { expenseCategories } from "@/lib/expenses";
import { getUserErrorMessage } from "@/lib/user-errors";

type Settings = FunctionReturnType<typeof api.expenses.getSettings>;
type EconomicMapping = Settings["economicMappings"][number];
type MappingDraft = {
  connectionId: EconomicMapping["connectionId"];
  enabled: boolean;
  journalNumber: string;
  contraAccountNumber: string;
  vatCode25: string;
  accountMappings: Array<{
    categoryId: EconomicMapping["accountMappings"][number]["categoryId"];
    accountNumber: string;
  }>;
};

function mappingDrafts(settings: Settings): MappingDraft[] {
  return settings.connections.map((connection) => {
    const mapping = settings.economicMappings.find(
      (item) => item.connectionId === connection.id,
    );
    return {
      connectionId: connection.id,
      enabled: mapping !== undefined,
      journalNumber: mapping ? String(mapping.journalNumber) : "",
      contraAccountNumber: mapping ? String(mapping.contraAccountNumber) : "",
      vatCode25: mapping?.vatCode25 ?? "",
      accountMappings: expenseCategories.map((category) => ({
        categoryId: category.id,
        accountNumber:
          mapping?.accountMappings
            .find((item) => item.categoryId === category.id)
            ?.accountNumber.toString() ?? "",
      })),
    };
  });
}

function positiveInteger(value: string, label: string) {
  const number = Number(value);
  if (!value.trim() || !Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} skal være et positivt heltal`);
  }
  return number;
}

function readRecipients(to: string, cc: string, bcc: string) {
  const split = (value: string) =>
    value.split(/[,;\n]/).map((email) => email.trim()).filter(Boolean);
  const recipients = { to: split(to), cc: split(cc), bcc: split(bcc) };
  const all = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  if (all.length > 50) throw new Error("Der kan højst angives 50 modtagere");
  if (all.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    throw new Error("En eller flere e-mailadresser er ugyldige");
  }
  if (new Set(all.map((email) => email.toLowerCase())).size !== all.length) {
    throw new Error("Den samme e-mailadresse må kun angives én gang");
  }
  if (!recipients.to.length && (recipients.cc.length || recipients.bcc.length)) {
    throw new Error("Angiv mindst én modtager i Til for at sende e-mails");
  }
  return recipients;
}

export function ExpenseSettings() {
  const { data: session } = authClient.useSession();
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) return <Skeleton className="h-72 w-full max-w-3xl" />;
  return (
    <ExpenseSettingsControl
      key={`${organizationId}:${session?.user.id}`}
      organizationId={organizationId}
    />
  );
}

function ExpenseSettingsControl({ organizationId }: { organizationId: string }) {
  const integrations = useIntegrations();
  const access = useAccess();
  const canManage = usePermission("expenses.settings");
  const canToggle = usePermission("organization.settings");
  const canManageIntegrations = usePermission("integrations.manage");
  const settings = useQuery(
    api.expenses.getSettings,
    canManage && access?.locationScope.all && !access.kiosk?.kioskModeEnabled
      ? {}
      : "skip",
  );
  const saveSettings = useMutation(api.expenses.setSettings);
  const [toDraft, setToDraft] = useState<string | null>(null);
  const [ccDraft, setCcDraft] = useState<string | null>(null);
  const [bccDraft, setBccDraft] = useState<string | null>(null);
  const [mappingsDraft, setMappingsDraft] = useState<MappingDraft[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!access) return <Skeleton className="h-72 w-full max-w-3xl" />;
  if (access.kiosk?.kioskModeEnabled) return null;
  if (!canManage) {
    if (canToggle) return null;
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre udgiftsindstillinger.
        </AlertDescription>
      </Alert>
    );
  }
  if (!access.locationScope.all) {
    return (
      <Alert className="max-w-3xl">
        <AlertTitle>Kræver adgang til alle lokationer</AlertTitle>
        <AlertDescription>
          Udgiftsindstillinger gælder hele organisationen. Du skal have adgang
          til alle lokationer for at se og ændre dem.
        </AlertDescription>
      </Alert>
    );
  }
  if (settings === undefined || settings.organizationId !== organizationId) {
    return <Skeleton className="h-72 w-full max-w-3xl" />;
  }

  const loadedSettings = settings;
  const to = toDraft ?? settings.to.join(", ");
  const cc = ccDraft ?? settings.cc.join(", ");
  const bcc = bccDraft ?? settings.bcc.join(", ");
  const mappings = mappingsDraft ?? mappingDrafts(settings);
  const usableConnections = settings.connections.filter(
    (connection) => integrations?.economic && connection.enabled && !connection.requiresReconnect,
  );
  const usableConnectionIds = new Set(
    usableConnections.map((connection) => connection.id),
  );
  const visibleMappings = mappings.filter((mapping) =>
    usableConnectionIds.has(mapping.connectionId),
  );
  const canEditMappings = integrations?.economic && canManageIntegrations && access.locationScope.all;

  function updateMapping(
    connectionId: MappingDraft["connectionId"],
    update: Partial<Omit<MappingDraft, "connectionId">>,
  ) {
    setMappingsDraft(
      mappings.map((mapping) =>
        mapping.connectionId === connectionId ? { ...mapping, ...update } : mapping,
      ),
    );
  }

  async function save() {
    if (saving) return;
    setError(null);
    try {
      const recipients = readRecipients(to, cc, bcc);
      const economicMappings: EconomicMapping[] =
        canEditMappings && mappingsDraft !== null
          ? [
              ...loadedSettings.economicMappings.filter(
                (mapping) => !usableConnectionIds.has(mapping.connectionId),
              ),
              ...visibleMappings
                .filter((mapping) => mapping.enabled)
                .map((mapping) => {
                  const vatCode25 = mapping.vatCode25.trim();
                  if (!vatCode25) throw new Error("Angiv en momskode til 25 % moms");
                  const accountMappings = mapping.accountMappings
                    .filter((account) => account.accountNumber.trim())
                    .map((account) => ({
                      categoryId: account.categoryId,
                      accountNumber: positiveInteger(account.accountNumber, "Udgiftskonto"),
                    }));
                  if (!accountMappings.length) {
                    throw new Error("Angiv mindst én udgiftskonto for hver aktiveret e-conomic-aftale");
                  }
                  return {
                    connectionId: mapping.connectionId,
                    journalNumber: positiveInteger(mapping.journalNumber, "Kassekladdenummer"),
                    contraAccountNumber: positiveInteger(mapping.contraAccountNumber, "Modkonto"),
                    vatCode25,
                    accountMappings,
                  };
                }),
            ]
          : loadedSettings.economicMappings;
      setSaving(true);
      await saveSettings({
        expectedOrganizationId: loadedSettings.organizationId,
        ...recipients,
        economicMappings,
      });
      setToDraft(null);
      setCcDraft(null);
      setBccDraft(null);
      setMappingsDraft(null);
      toast.success("Udgiftsindstillingerne er gemt");
    } catch (cause) {
      const message = getUserErrorMessage(cause, "Udgiftsindstillingerne kunne ikke gemmes. Prøv igen.");
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex max-w-3xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>E-mailmodtagere</CardTitle>
          <CardDescription>
            Send en e-mail, når en udgift bliver registreret.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {[
              { id: "expense-to", label: "Til", value: to, onChange: setToDraft },
              { id: "expense-cc", label: "CC", value: cc, onChange: setCcDraft },
              { id: "expense-bcc", label: "BCC", value: bcc, onChange: setBccDraft },
            ].map((field) => (
              <Field key={field.id} data-disabled={saving}>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
                  <HelpTooltip
                    label={field.label}
                    content={
                      field.id === "expense-to"
                        ? "Adskil e-mailadresser med komma eller semikolon. Højst 50 modtagere i alt. Lad alle felter stå tomme for at slå e-mails fra."
                        : field.id === "expense-bcc"
                          ? "Disse modtagere skjules for de øvrige modtagere. Adskil e-mailadresser med komma eller semikolon."
                          : "Disse modtagere får en kopi. Adskil e-mailadresser med komma eller semikolon."
                    }
                  />
                </div>
                <Input
                  id={field.id}
                  type="text"
                  inputMode="email"
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  value={field.value}
                  disabled={saving}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder="modtager@eksempel.dk"
                />
              </Field>
            ))}
          </FieldGroup>
        </CardContent>
      </Card>

      {usableConnections.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>e-conomic</CardTitle>
            <CardDescription>
              Udgifter oprettes som kladder til gennemgang i e-conomic.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              {!canEditMappings ? (
                <Alert>
                  <AlertDescription>
                    Du skal have adgang til at administrere integrationer og alle
                    lokationer for at ændre konteringen.
                  </AlertDescription>
                </Alert>
              ) : null}
              {visibleMappings.map((mapping) => {
                const connection = usableConnections.find(
                  (item) => item.id === mapping.connectionId,
                );
                if (!connection) return null;
                const disabled = saving || !canEditMappings;
                return (
                  <FieldSet key={connection.id} disabled={disabled}>
                    <FieldLegend>{connection.name}</FieldLegend>
                    <FieldDescription>Aftalenummer {connection.agreementNumber}</FieldDescription>
                    <FieldGroup>
                      <SettingsSwitchField
                        label="Brug til udgifter"
                        checked={mapping.enabled}
                        disabled={disabled}
                        onCheckedChange={(enabled) => updateMapping(connection.id, { enabled })}
                        help={{
                          label: "udgifter i e-conomic",
                          content: "Gør forbindelsen tilgængelig ved registrering af udgifter. Hver udgift sendes først, når brugeren vælger det. Kladden skal gennemgås og bogføres i e-conomic.",
                        }}
                      />
                      {mapping.enabled ? (
                        <>
                          <FieldGroup className="grid gap-4 sm:grid-cols-2">
                            <Field data-disabled={disabled}>
                              <div className="flex items-center gap-1">
                                <FieldLabel htmlFor={`expense-journal-${connection.id}`}>Kassekladdenummer</FieldLabel>
                                <HelpTooltip label="kassekladdenummer" content="Nummeret på den kassekladde i e-conomic, der skal modtage udgifterne." />
                              </div>
                              <Input id={`expense-journal-${connection.id}`} type="number" min="1" step="1" required disabled={disabled} value={mapping.journalNumber} onChange={(event) => updateMapping(connection.id, { journalNumber: event.target.value })} />
                            </Field>
                            <Field data-disabled={disabled}>
                              <div className="flex items-center gap-1">
                                <FieldLabel htmlFor={`expense-contra-${connection.id}`}>Modkonto</FieldLabel>
                                <HelpTooltip label="modkonto" content="Kontonummeret for udgiftens modpost i e-conomic, for eksempel en bank- eller mellemregningskonto." />
                              </div>
                              <Input id={`expense-contra-${connection.id}`} type="number" min="1" step="1" required disabled={disabled} value={mapping.contraAccountNumber} onChange={(event) => updateMapping(connection.id, { contraAccountNumber: event.target.value })} />
                            </Field>
                            <Field data-disabled={disabled}>
                              <div className="flex items-center gap-1">
                                <FieldLabel htmlFor={`expense-vat-${connection.id}`}>Momskode ved 25 % moms</FieldLabel>
                                <HelpTooltip label="momskode" content="Momskoden for køb med 25 % moms i denne e-conomic-aftale. Udgifter uden moms oprettes uden momskode." />
                              </div>
                              <Input id={`expense-vat-${connection.id}`} required disabled={disabled} value={mapping.vatCode25} onChange={(event) => updateMapping(connection.id, { vatCode25: event.target.value })} />
                            </Field>
                          </FieldGroup>
                          <FieldSet>
                            <FieldLegend variant="label">
                              <span className="flex items-center gap-1">
                                Udgiftskonti
                                <HelpTooltip label="udgiftskonti" content="Angiv mindst én udgiftskonto. Kategorier uden en konto kan stadig registreres her, men kan ikke oprettes i e-conomic." />
                              </span>
                            </FieldLegend>
                            <FieldGroup className="grid gap-4 sm:grid-cols-2">
                              {mapping.accountMappings.map((account) => (
                                <Field key={account.categoryId} data-disabled={disabled}>
                                  <FieldLabel htmlFor={`expense-account-${connection.id}-${account.categoryId}`}>
                                    {expenseCategories.find((category) => category.id === account.categoryId)?.label}
                                  </FieldLabel>
                                  <Input
                                    id={`expense-account-${connection.id}-${account.categoryId}`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    disabled={disabled}
                                    value={account.accountNumber}
                                    onChange={(event) => updateMapping(connection.id, {
                                      accountMappings: mapping.accountMappings.map((item) => item.categoryId === account.categoryId ? { ...item, accountNumber: event.target.value } : item),
                                    })}
                                  />
                                </Field>
                              ))}
                            </FieldGroup>
                          </FieldSet>
                        </>
                      ) : null}
                    </FieldGroup>
                  </FieldSet>
                );
              })}
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem indstillinger
        </Button>
      </div>
    </form>
  );
}
