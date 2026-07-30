"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  CircleAlertIcon,
  PlugIcon,
  RefreshCwIcon,
  ShoppingBasketIcon,
  UnplugIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";

type OnlinePosProduct = {
  id: number;
  name: string;
  groupName: string;
};

type Sale = {
  id: number;
  checkNumber: number;
  date: string;
  time: string;
  onlinePosProductId: number;
  onlinePosProductName: string;
  localProductName: string | null;
  amount: number;
  price: string;
  paymentType: string;
  department: string;
};

const connectedAtFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function dateInput(daysAgo: number) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function ConnectionCard({
  settings,
  onDisabled,
}: {
  settings: {
    connected: boolean;
    enabled: boolean;
    companyId: number | null;
    connectedAt: number | null;
  };
  onDisabled: () => void;
}) {
  const connect = useAction(api.onlinePos.connect);
  const setEnabled = useAction(api.onlinePos.setEnabled);
  const disconnect = useMutation(api.onlinePos.disconnect);
  const [companyIdDraft, setCompanyIdDraft] = useState<string | null>(null);
  const [token, setToken] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [changingEnabled, setChangingEnabled] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const companyId = companyIdDraft ?? String(settings.companyId ?? "");

  async function saveConnection() {
    const parsedCompanyId = Number(companyId);
    if (!Number.isSafeInteger(parsedCompanyId) || parsedCompanyId <= 0) {
      toast.error("Indtast et gyldigt firma-id");
      return;
    }
    if (!token.trim()) {
      toast.error("Indtast dit OnlinePOS-token");
      return;
    }

    setConnecting(true);
    try {
      const result = await connect({ companyId: parsedCompanyId, token });
      setToken("");
      setCompanyIdDraft(null);
      toast.success(
        `OnlinePOS er forbundet. ${result.productCount} produkter blev fundet.`,
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setConnecting(false);
    }
  }

  async function changeEnabled(enabled: boolean) {
    setChangingEnabled(true);
    try {
      await setEnabled({ enabled });
      if (!enabled) onDisabled();
      toast.success(
        enabled
          ? "OnlinePOS-integrationen er aktiveret"
          : "OnlinePOS-integrationen er deaktiveret",
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setChangingEnabled(false);
    }
  }

  async function removeConnection() {
    setDisconnecting(true);
    try {
      await disconnect({});
      setCompanyIdDraft("");
      setToken("");
      onDisabled();
      toast.success("Forbindelsen til OnlinePOS er fjernet");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>OnlinePOS</CardTitle>
        <CardDescription>
          Forbind organisationen med OnlinePOS for at koble produkter og hente
          salg.
        </CardDescription>
        <CardAction>
          <Badge variant={settings.enabled ? "default" : "secondary"}>
            {settings.enabled
              ? "Aktiv"
              : settings.connected
                ? "Deaktiveret"
                : "Ikke forbundet"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {settings.connected ? (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel htmlFor="online-pos-enabled">
                Aktivér integration
              </FieldLabel>
              <FieldDescription>
                Produktkoblinger og salg er kun tilgængelige, når integrationen
                er aktiv.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="online-pos-enabled"
              aria-label="Aktivér OnlinePOS-integration"
              checked={settings.enabled}
              disabled={changingEnabled}
              onCheckedChange={(enabled) => void changeEnabled(enabled)}
            />
          </Field>
        ) : null}

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="online-pos-company-id">Firma-id</FieldLabel>
            <Input
              id="online-pos-company-id"
              type="number"
              inputMode="numeric"
              min={1}
              value={companyId}
              onChange={(event) => setCompanyIdDraft(event.target.value)}
              placeholder="Firma-id fra OnlinePOS"
              className="h-11"
            />
          </Field>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="online-pos-token">
                {settings.connected ? "Nyt token" : "Token"}
              </FieldLabel>
              <HelpTooltip
                label="OnlinePOS-token"
                content="Tokenet bruges kun på serveren og vises ikke igen efter lagring."
              />
            </div>
            <Input
              id="online-pos-token"
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                settings.connected
                  ? "Indtast kun ved opdatering"
                  : "Token fra OnlinePOS"
              }
              className="h-11"
            />
          </Field>
        </FieldGroup>

        {settings.connectedAt ? (
          <p className="text-sm text-muted-foreground">
            Senest forbundet {connectedAtFormatter.format(settings.connectedAt)}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-3">
        {settings.connected ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" disabled={disconnecting} />}
            >
              <UnplugIcon data-icon="inline-start" />
              Fjern forbindelse
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Fjern forbindelsen til OnlinePOS?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Tokenet og alle produktkoblinger slettes. Handlingen kan ikke
                  fortrydes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={disconnecting}>
                  Behold forbindelse
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={disconnecting}
                  onClick={() => void removeConnection()}
                >
                  {disconnecting ? <Spinner data-icon="inline-start" /> : null}
                  Fjern forbindelse
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <Button disabled={connecting} onClick={() => void saveConnection()}>
          {connecting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlugIcon data-icon="inline-start" />
          )}
          {settings.connected ? "Opdater forbindelse" : "Forbind OnlinePOS"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ProductMappings({
  onlinePosProducts,
  loading,
  onReload,
}: {
  onlinePosProducts: OnlinePosProduct[] | null;
  loading: boolean;
  onReload: () => void;
}) {
  const mappingOptions = useQuery(api.onlinePos.listMappingOptions);
  const setMapping = useMutation(api.onlinePos.setProductMapping);
  const [savingProductId, setSavingProductId] = useState<Id<"products">>();
  const comboboxOptions = useMemo(
    () =>
      (onlinePosProducts ?? []).map((product) => ({
        value: String(product.id),
        label: product.groupName
          ? `${product.name} — ${product.groupName}`
          : product.name,
      })),
    [onlinePosProducts],
  );

  async function changeMapping(
    productId: Id<"products">,
    onlinePosProductId: string | null,
  ) {
    setSavingProductId(productId);
    try {
      await setMapping({
        productId,
        onlinePosProductId:
          onlinePosProductId === null ? null : Number(onlinePosProductId),
      });
      toast.success(
        onlinePosProductId === null
          ? "Produktkoblingen er fjernet"
          : "Produktkoblingen er gemt",
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingProductId(undefined);
    }
  }

  if (!mappingOptions || (loading && !onlinePosProducts)) {
    return <Skeleton className="h-96 w-full max-w-5xl" />;
  }

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Produktkoblinger</CardTitle>
        <CardDescription>
          Vælg hvilket OnlinePOS-produkt hvert lokalt produkt svarer til.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onReload}
          >
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Opdatér produkter
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mappingOptions.limitReached ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Kun de første 500 produkter vises</AlertTitle>
            <AlertDescription>
              Arkivér ubrugte produkter for at få hele listen med.
            </AlertDescription>
          </Alert>
        ) : null}

        {mappingOptions.products.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingBasketIcon />
              </EmptyMedia>
              <EmptyTitle>Ingen aktive produkter</EmptyTitle>
              <EmptyDescription>
                Opret lokale produkter, før du laver produktkoblinger.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : onlinePosProducts ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lokalt produkt</TableHead>
                <TableHead className="w-[60%]">OnlinePOS-produkt</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappingOptions.products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell>
                    <CreatableCombobox
                      options={comboboxOptions}
                      value={
                        product.onlinePosProductId === null
                          ? null
                          : String(product.onlinePosProductId)
                      }
                      onValueChange={(value) =>
                        void changeMapping(product.id, value)
                      }
                      placeholder="Søg efter OnlinePOS-produkt"
                      ariaLabel={`OnlinePOS-produkt for ${product.name}`}
                      disabled={savingProductId === product.id}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Produkterne kunne ikke indlæses</AlertTitle>
            <AlertDescription>
              Kontrollér forbindelsen, og prøv igen.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

function SalesList() {
  const listSales = useAction(api.onlinePos.listSales);
  const [fromDate, setFromDate] = useState(() => dateInput(7));
  const [toDate, setToDate] = useState(() => dateInput(0));
  const [sales, setSales] = useState<Sale[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadSales() {
    const from = new Date(`${fromDate}T00:00:00`).getTime();
    const to = new Date(`${toDate}T00:00:00`).getTime() + 24 * 60 * 60 * 1000;
    if (
      !fromDate ||
      !toDate ||
      !Number.isFinite(from) ||
      !Number.isFinite(to)
    ) {
      toast.error("Vælg en gyldig periode");
      return;
    }

    setLoading(true);
    try {
      const result = await listSales({ from, to });
      setSales(result.sales);
      setTruncated(result.truncated);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-6xl">
      <CardHeader>
        <CardTitle>Salg fra OnlinePOS</CardTitle>
        <CardDescription>
          Hent salg for en periode på højst 31 dage. Datoerne er inklusive.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <Field>
            <FieldLabel htmlFor="online-pos-sales-from">Fra dato</FieldLabel>
            <Input
              id="online-pos-sales-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="h-11"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="online-pos-sales-to">Til dato</FieldLabel>
            <Input
              id="online-pos-sales-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="h-11"
            />
          </Field>
          <Button disabled={loading} onClick={() => void loadSales()}>
            {loading ? <Spinner data-icon="inline-start" /> : null}
            Hent salg
          </Button>
        </FieldGroup>

        {truncated ? (
          <Alert>
            <CircleAlertIcon />
            <AlertTitle>Listen er afkortet</AlertTitle>
            <AlertDescription>
              De første 500 salg vises. Vælg en kortere periode for at se
              resten.
            </AlertDescription>
          </Alert>
        ) : null}

        {sales === null ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingBasketIcon />
              </EmptyMedia>
              <EmptyTitle>Vælg en periode</EmptyTitle>
              <EmptyDescription>
                Salg hentes direkte fra OnlinePOS, når du trykker på Hent salg.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : sales.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Ingen salg i perioden</EmptyTitle>
              <EmptyDescription>
                Prøv at vælge en anden periode.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dato</TableHead>
                <TableHead>OnlinePOS-produkt</TableHead>
                <TableHead>Lokalt produkt</TableHead>
                <TableHead>Antal</TableHead>
                <TableHead>Pris</TableHead>
                <TableHead>Afdeling</TableHead>
                <TableHead>Betaling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={`${sale.id}-${sale.checkNumber}`}>
                  <TableCell>
                    {sale.date} {sale.time}
                  </TableCell>
                  <TableCell>{sale.onlinePosProductName}</TableCell>
                  <TableCell>
                    {sale.localProductName ? (
                      sale.localProductName
                    ) : (
                      <Badge variant="secondary">Ikke koblet</Badge>
                    )}
                  </TableCell>
                  <TableCell>{sale.amount}</TableCell>
                  <TableCell>{sale.price}</TableCell>
                  <TableCell>{sale.department || "—"}</TableCell>
                  <TableCell>{sale.paymentType || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function OnlinePosIntegration() {
  const membership = authClient.useActiveMemberRole();
  const isAdmin = canManageOrganization(membership.data?.role);
  const settings = useQuery(api.onlinePos.getSettings, isAdmin ? {} : "skip");
  const listOnlinePosProducts = useAction(api.onlinePos.listProducts);
  const [tab, setTab] = useState("connection");
  const [onlinePosProducts, setOnlinePosProducts] = useState<
    OnlinePosProduct[] | null
  >(null);
  const [loadingProducts, setLoadingProducts] = useState(false);

  async function loadProducts() {
    setLoadingProducts(true);
    try {
      setOnlinePosProducts(await listOnlinePosProducts({}));
    } catch (error) {
      setOnlinePosProducts(null);
      toast.error(messageFrom(error));
    } finally {
      setLoadingProducts(false);
    }
  }

  if (membership.isPending) {
    return <Skeleton className="h-96 w-full max-w-3xl" />;
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun administratorer kan administrere integrationer.
        </AlertDescription>
      </Alert>
    );
  }

  if (!settings) {
    return <Skeleton className="h-96 w-full max-w-3xl" />;
  }

  if (!settings.enabled) {
    return (
      <ConnectionCard
        settings={settings}
        onDisabled={() => setTab("connection")}
      />
    );
  }

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value);
        if (value === "mappings" && !onlinePosProducts && !loadingProducts) {
          void loadProducts();
        }
      }}
      className="gap-5"
    >
      <TabsList
        aria-label="OnlinePOS-sektioner"
        className="w-full justify-start"
      >
        <TabsTrigger value="connection">Forbindelse</TabsTrigger>
        <TabsTrigger value="mappings">Produktkoblinger</TabsTrigger>
        <TabsTrigger value="sales">Salg</TabsTrigger>
      </TabsList>
      <TabsContent value="connection">
        <ConnectionCard
          settings={settings}
          onDisabled={() => setTab("connection")}
        />
      </TabsContent>
      <TabsContent value="mappings">
        <ProductMappings
          onlinePosProducts={onlinePosProducts}
          loading={loadingProducts}
          onReload={() => void loadProducts()}
        />
      </TabsContent>
      <TabsContent value="sales">
        <SalesList />
      </TabsContent>
    </Tabs>
  );
}
