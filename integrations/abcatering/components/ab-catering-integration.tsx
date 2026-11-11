"use client";

import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { supplierCatalogs } from "@/components/supplier-catalog/catalog";
import { SupplierCatalogLinks } from "@/components/supplier-catalog/catalog-links";
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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

type Customer = {
  customerNo: string;
  customerName: string;
  department: string;
};

export function AbCateringIntegration() {
  const settings = useQuery(api.integrations.abcatering.api.getSettings);
  if (settings === undefined) return <Skeleton className="h-72 w-full" />;
  return (
    <div className="flex flex-col gap-5">
      <ConnectionCard settings={settings} />
      {settings.connection ? (
        <SupplierCatalogLinks catalog={supplierCatalogs.abcatering} />
      ) : null}
    </div>
  );
}

function customerLabel(customer: Customer) {
  return `${customer.customerNo} · ${customer.customerName}${customer.department ? ` (${customer.department})` : ""}`;
}

function ConnectionCard({
  settings,
}: {
  settings: FunctionReturnType<
    typeof api.integrations.abcatering.api.getSettings
  >;
}) {
  const connect = useAction(api.integrations.abcatering.api.connect);
  const disconnect = useMutation(api.integrations.abcatering.api.disconnect);
  const setSendOrders = useMutation(
    api.integrations.abcatering.api.setSendOrders,
  );
  const [editing, setEditing] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  // Set when the AB user has several customers to choose from.
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [customerNo, setCustomerNo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const showForm = !settings.connection || editing;
  const complete =
    apiKey.trim() &&
    username.trim() &&
    password.trim() &&
    (!customers || customerNo);

  function reset() {
    setApiKey("");
    setUsername("");
    setPassword("");
    setCustomers(null);
    setCustomerNo(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    try {
      const result = await connect({
        expectedOrganizationId: settings.organizationId,
        apiKey,
        username,
        password,
        customerNo: customerNo ?? undefined,
      });
      if (result.status === "chooseCustomer") {
        setCustomers(result.customers);
        setCustomerNo(null);
        return;
      }
      reset();
      toast.success(
        `AB Catering er forbundet. Kataloget har ${result.productCount} varer.`,
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "AB Catering kunne ikke forbindes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeSendOrders(sendOrders: boolean) {
    setSaving(true);
    try {
      await setSendOrders({ sendOrders });
      toast.success(
        sendOrders
          ? "Bestillinger sendes til AB Catering"
          : "Bestillinger sendes ikke til AB Catering",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Indstillingen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDisconnect() {
    setSaving(true);
    try {
      await disconnect({});
      setConfirming(false);
      toast.success("AB Catering er afbrudt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "AB Catering kunne ikke afbrydes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forbindelse</CardTitle>
        <CardDescription>
          {settings.connection
            ? `Kunde ${customerLabel(settings.connection)}`
            : "Indtast API-nøglen og login fra AB Catering. Bestillinger sendes direkte til AB Catering."}
        </CardDescription>
      </CardHeader>
      {showForm ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <CardContent>
            <FieldGroup>
              <Field>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="ab-catering-api-key">
                    API-nøgle
                  </FieldLabel>
                  <HelpTooltip
                    label="API-nøgle"
                    content="Nøglen gemmes krypteret og vises ikke igen."
                  />
                </div>
                <Input
                  id="ab-catering-api-key"
                  type="password"
                  autoComplete="new-password"
                  className="h-11"
                  value={apiKey}
                  disabled={saving}
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="ab-catering-username">
                  Brugernavn
                </FieldLabel>
                <Input
                  id="ab-catering-username"
                  autoComplete="off"
                  className="h-11"
                  value={username}
                  disabled={saving}
                  onChange={(event) => {
                    setUsername(event.target.value);
                    setCustomers(null);
                  }}
                />
              </Field>
              <Field>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="ab-catering-password">
                    Adgangskode
                  </FieldLabel>
                  <HelpTooltip
                    label="Adgangskode"
                    content="Bruges kun til at logge ind og gemmes ikke. Ændres adgangskoden hos AB Catering, skal du forbinde igen."
                  />
                </div>
                <PasswordInput
                  id="ab-catering-password"
                  autoComplete="new-password"
                  className="h-11"
                  value={password}
                  disabled={saving}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </Field>
              {customers ? (
                <FieldSet>
                  <FieldLegend variant="label">Vælg kunde</FieldLegend>
                  <RadioGroup
                    value={customerNo}
                    onValueChange={(value) => setCustomerNo(value as string)}
                    appearance="spaced"
                  >
                    {customers.map((customer) => (
                      <label
                        key={customer.customerNo}
                        className="flex min-h-11 items-center gap-3 rounded-md border px-3"
                      >
                        <RadioGroupItem
                          value={customer.customerNo}
                          disabled={saving}
                        />
                        {customerLabel(customer)}
                      </label>
                    ))}
                  </RadioGroup>
                </FieldSet>
              ) : null}
            </FieldGroup>
          </CardContent>
          <CardFooter className="mt-6 justify-end">
            <div className="flex gap-2">
              {settings.connection ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={saving}
                  onClick={reset}
                >
                  Annullér
                </Button>
              ) : null}
              <Button type="submit" size="lg" disabled={saving || !complete}>
                {saving ? <Spinner data-icon="inline-start" /> : null}
                Forbind AB Catering
              </Button>
            </div>
          </CardFooter>
        </form>
      ) : (
        <>
          {settings.connection ? (
            <CardContent>
              <Field orientation="horizontal" data-disabled={saving}>
                <Switch
                  id="ab-catering-send-orders"
                  checked={settings.connection.sendOrders}
                  onCheckedChange={(checked) => void changeSendOrders(checked)}
                  disabled={saving}
                />
                <FieldLabel
                  htmlFor="ab-catering-send-orders"
                  appearance="regular"
                >
                  Send bestillinger til AB Catering
                </FieldLabel>
                <HelpTooltip
                  label="Send bestillinger til AB Catering"
                  content="Slået fra gemmes bestillinger kun i appen og sendes som e-mail, hvis leverandøren har en e-mailadresse."
                />
              </Field>
            </CardContent>
          ) : null}
          <CardFooter className="justify-end">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setConfirming(true)}
              >
                Afbryd
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setEditing(true)}
              >
                Forbind igen
              </Button>
            </div>
          </CardFooter>
        </>
      )}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!saving) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Afbryd AB Catering?</AlertDialogTitle>
            <AlertDialogDescription>
              API-nøglen og login slettes, og der kan ikke bestilles hos AB
              Catering, før du forbinder igen. Produktkoblinger og tidligere
              bestillinger bevares.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void confirmDisconnect();
              }}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Afbryd AB Catering
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
