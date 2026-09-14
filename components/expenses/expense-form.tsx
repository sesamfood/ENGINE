"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { FileTextIcon, SaveIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { usePermission } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
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
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateKey, DEFAULT_TIME_ZONE, parseDateKey } from "@/lib/date";
import {
  expenseCategories,
  formatExpenseAmount,
  parseExpenseAmount,
  type ExpenseCategoryId,
} from "@/lib/expenses";
import { selectedLocationId } from "@/lib/location-preference";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { getUserErrorMessage } from "@/lib/user-errors";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ECONOMIC_ATTACHMENT_SIZE = 9_000_000;
const vatOptions = [
  { value: 25, label: "25 %" },
  { value: 0, label: "0 %" },
];
const numberFormatter = new Intl.NumberFormat("da-DK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function ExpenseForm({
  organizationId,
  navigation,
}: {
  organizationId: string;
  navigation?: ReactNode;
}) {
  const options = useQuery(api.expenses.getFormOptions, {});
  const createExpense = useMutation(api.expenses.create);
  const getUploadUrl = useMutation(api.expenses.getUploadUrl);
  const integrations = useIntegrations();
  const canExport = usePermission("expenses.exportEconomic") && integrations?.economic === true;
  const storedLocationId = useWasteLocation(organizationId);
  const locations =
    options?.organizationId === organizationId ? options.locations : undefined;
  const locationId = selectedLocationId({
    locations: locations ?? [],
    storedId: storedLocationId,
    lockedId: null,
    isLocked: false,
  });
  const location = locations?.find((option) => option.id === locationId);
  const [categoryId, setCategoryId] = useState<ExpenseCategoryId | null>(null);
  const [supplier, setSupplier] = useState("");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState(25);
  const [date, setDate] = useState(() =>
    dateKey(Date.now(), DEFAULT_TIME_ZONE),
  );
  const [period, setPeriod] = useState(() => date.slice(0, 7));
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sendToEconomic, setSendToEconomic] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const requestId = useRef<string | null>(null);
  const uploaded = useRef<{ file: File; storageId: Id<"_storage"> } | null>(
    null,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const netAmount = parseExpenseAmount(amount);
  const grossAmount =
    netAmount === null
      ? null
      : netAmount + Math.round((netAmount * vatRate) / 100);
  const category = expenseCategories.find((option) => option.id === categoryId);
  const exportAvailable = Boolean(location?.economicAvailable && canExport);
  const categoryMapped = Boolean(
    categoryId && location?.economicCategoryIds.includes(categoryId),
  );
  const shouldExport = Boolean(integrations?.economic && location?.economicConfigured && sendToEconomic);
  const exportValid = !shouldExport || (exportAvailable && categoryMapped);
  const amountValid =
    netAmount !== null && netAmount > 0 && netAmount <= 1_000_000_000;
  const periodValid = /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(period);
  let dateValid = false;
  try {
    parseDateKey(date);
    dateValid = date >= "1900-01-01" && date <= "2199-12-31";
  } catch {
    /* The date input can be empty while editing. */
  }
  const attachmentValid =
    !shouldExport || !file || file.size <= MAX_ECONOMIC_ATTACHMENT_SIZE;
  const ready = Boolean(
    location &&
    category &&
    supplier.trim() &&
    amountValid &&
    dateValid &&
    periodValid &&
    attachmentValid &&
    exportValid,
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function selectFile(next: File | undefined) {
    if (!next || savingRef.current) return;
    let error: string | undefined;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(next.type)) {
      error = "Vælg et bilag i PDF-, JPG- eller PNG-format.";
    } else if (next.size > MAX_ATTACHMENT_SIZE) {
      error = "Bilaget må højst fylde 10 MB.";
    } else if (next.size === 0) {
      error = "Bilaget er tomt. Vælg en anden fil.";
    } else if (next.name.length > 200 || /[\x00-\x1f/\\]/.test(next.name)) {
      error =
        "Omdøb bilaget til et filnavn på højst 200 tegn uden skråstreger.";
    }
    setErrors((current) => ({ ...current, attachment: error ?? "" }));
    if (!error) {
      setFile(next);
      uploaded.current = null;
    }
  }

  async function save() {
    if (savingRef.current) return;
    const nextErrors: Record<string, string> = {};
    if (!location) nextErrors.location = "Vælg en lokation.";
    if (!categoryId) nextErrors.category = "Vælg en kategori.";
    if (!supplier.trim())
      nextErrors.supplier = "Angiv leverandør eller modtager.";
    if (!amountValid) {
      nextErrors.amount =
        "Angiv et beløb over 0 og højst 10.000.000,00, fx 12.500,00.";
    }
    if (!dateValid) {
      nextErrors.date = "Vælg en gyldig dato mellem 1900 og 2199.";
    }
    if (!periodValid)
      nextErrors.period = "Vælg en gyldig måned mellem 1900 og 2199.";
    if (!attachmentValid) {
      nextErrors.attachment =
        "Bilag til e-conomic må højst fylde 9 MB. Vælg en mindre fil.";
    }
    if (!exportValid) {
      nextErrors.economic =
        "Udgiften kan ikke overføres med den valgte lokation og kategori. Kontrollér opsætningen, eller fjern markeringen ved e-conomic.";
    }
    setErrors(nextErrors);
    if (
      Object.keys(nextErrors).length ||
      !location ||
      !categoryId ||
      netAmount === null
    )
      return;
    savingRef.current = true;
    setSaving(true);
    requestId.current ??= crypto.randomUUID();
    try {
      let attachment:
        { storageId: Id<"_storage">; fileName: string } | undefined;
      if (file) {
        if (uploaded.current?.file !== file) {
          const storageId = await uploadToStorage({
            uploadUrl: await getUploadUrl({
              expectedOrganizationId: organizationId,
            }),
            file,
          });
          if (!mounted.current) return;
          uploaded.current = { file, storageId };
        }
        attachment = {
          storageId: uploaded.current.storageId,
          fileName: file.name,
        };
      }
      if (!mounted.current) return;
      await createExpense({
        requestId: requestId.current,
        expectedOrganizationId: organizationId,
        locationId: location.id,
        categoryId,
        supplier: supplier.trim(),
        netAmount,
        vatRate,
        date,
        period,
        comment: comment.trim(),
        ...(attachment ? { attachment } : {}),
        sendToEconomic: shouldExport,
      });
      if (!mounted.current) return;
      setSupplier("");
      setAmount("");
      setComment("");
      setFile(null);
      setSendToEconomic(false);
      setErrors({});
      requestId.current = null;
      uploaded.current = null;
      toast.success(
        shouldExport
          ? "Udgiften er registreret. Se status for e-mail og e-conomic under Udgifter."
          : "Udgiften er registreret. Se status for e-mail under Udgifter.",
      );
    } catch (error) {
      if (mounted.current)
        toast.error(
          getUserErrorMessage(
            error,
            "Udgiften kunne ikke registreres. Prøv igen.",
          ),
        );
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (!locations) return <Skeleton className="h-96 w-full" />;
  if (!locations.length) {
    return (
      <>
        <Alert>
          <AlertTitle>Ingen tilgængelige lokationer</AlertTitle>
          <AlertDescription>
            Du skal have adgang til en lokation for at oprette en udgift.
          </AlertDescription>
        </Alert>
        {navigation ? (
          <AppBottomBar>
            <div className="mx-auto w-full max-w-[96rem]">{navigation}</div>
          </AppBottomBar>
        ) : null}
      </>
    );
  }

  return (
    <form
      id="expense-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset
        disabled={saving}
        className="grid min-w-0 items-start gap-5 lg:grid-cols-2"
      >
        <legend className="sr-only">Opret udgift</legend>
        <Card>
          <CardHeader>
            <CardTitle>Detaljer</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <FieldGroup className="grid sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.location)}>
                  <FieldLabel htmlFor="expense-location">Lokation</FieldLabel>
                  <LocationField
                    id="expense-location"
                    locations={locations}
                    value={locationId}
                    disabled={saving}
                    onValueChange={(value) => {
                      setRegistrationLocation(organizationId, value);
                      const nextLocation = locations.find(
                        (option) => option.id === value,
                      );
                      if (
                        integrations?.economic && sendToEconomic &&
                        (!nextLocation?.economicAvailable ||
                          !categoryId ||
                          !nextLocation.economicCategoryIds.includes(
                            categoryId,
                          ))
                      ) {
                        setSendToEconomic(false);
                        toast.info(
                          "Overførsel til e-conomic er slået fra. Den valgte lokation mangler opsætning til denne kategori.",
                        );
                      }
                    }}
                  />
                  <FieldError>{errors.location}</FieldError>
                </Field>
                <Field data-invalid={Boolean(errors.category)}>
                  <FieldLabel htmlFor="expense-category">Kategori</FieldLabel>
                  <Select
                    items={expenseCategories.map((option) => ({
                      value: option.id,
                      label: option.label,
                    }))}
                    value={categoryId}
                    disabled={saving}
                    onValueChange={(value) => {
                      const next = expenseCategories.find(
                        (option) => option.id === value,
                      );
                      setCategoryId(next?.id ?? null);
                      if (
                        integrations?.economic && sendToEconomic &&
                        (!next ||
                          !location?.economicCategoryIds.includes(next.id))
                      ) {
                        setSendToEconomic(false);
                        toast.info(
                          "Overførsel til e-conomic er slået fra. Den valgte kategori mangler en konto i opsætningen.",
                        );
                      }
                    }}
                  >
                    <SelectTrigger
                      id="expense-category"
                      className="h-11! w-full"
                      aria-invalid={Boolean(errors.category)}
                    >
                      <SelectValue placeholder="Vælg kategori" />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {expenseCategories.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldError>{errors.category}</FieldError>
                </Field>
              </FieldGroup>
              <Field data-invalid={Boolean(errors.supplier)}>
                <FieldLabel htmlFor="expense-supplier">
                  Leverandør / modtager
                </FieldLabel>
                <Input
                  id="expense-supplier"
                  className="h-11"
                  value={supplier}
                  onChange={(event) => setSupplier(event.target.value)}
                  maxLength={200}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.supplier)}
                />
                <FieldError>{errors.supplier}</FieldError>
              </Field>
              <FieldGroup className="grid sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.amount)}>
                  <FieldLabel htmlFor="expense-amount">
                    Beløb ekskl. moms{location ? ` · ${location.currency}` : ""}
                  </FieldLabel>
                  <Input
                    id="expense-amount"
                    className="h-11"
                    inputMode="decimal"
                    placeholder="0,00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    aria-invalid={Boolean(errors.amount)}
                  />
                  <FieldError>{errors.amount}</FieldError>
                </Field>
                <Field>
                  <FieldLabel htmlFor="expense-vat">Moms</FieldLabel>
                  <Select
                    items={vatOptions}
                    value={vatRate}
                    disabled={saving}
                    onValueChange={(value) => {
                      if (value === 0 || value === 25) setVatRate(value);
                    }}
                  >
                    <SelectTrigger id="expense-vat" className="h-11! w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      <SelectGroup>
                        {vatOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="expense-gross">
                  Beløb inkl. moms
                </FieldLabel>
                <Input
                  id="expense-gross"
                  className="h-11"
                  readOnly
                  value={
                    grossAmount === null
                      ? ""
                      : numberFormatter.format(grossAmount / 100)
                  }
                  placeholder="0,00"
                />
              </Field>
              <FieldGroup className="grid sm:grid-cols-2">
                <Field data-invalid={Boolean(errors.date)}>
                  <FieldLabel htmlFor="expense-date">Dato</FieldLabel>
                  <Input
                    id="expense-date"
                    type="date"
                    className="h-11"
                    min="1900-01-01"
                    max="2199-12-31"
                    value={date}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (period === date.slice(0, 7))
                        setPeriod(next.slice(0, 7));
                      setDate(next);
                    }}
                    aria-invalid={Boolean(errors.date)}
                  />
                  <FieldError>{errors.date}</FieldError>
                </Field>
                <Field data-invalid={Boolean(errors.period)}>
                  <FieldLabel htmlFor="expense-period">Periode</FieldLabel>
                  <Input
                    id="expense-period"
                    type="month"
                    className="h-11"
                    min="1900-01"
                    max="2199-12"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                    aria-invalid={Boolean(errors.period)}
                  />
                  <FieldError>{errors.period}</FieldError>
                </Field>
              </FieldGroup>
              <Field>
                <FieldLabel htmlFor="expense-comment">
                  Kommentar · valgfri
                </FieldLabel>
                <Textarea
                  id="expense-comment"
                  placeholder="Tilføj note"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={2000}
                  rows={3}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Dokumentation</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(errors.attachment)}>
                  <FieldLabel htmlFor="expense-attachment">
                    Upload bilag · valgfrit
                  </FieldLabel>
                  <input
                    ref={fileInput}
                    id="expense-attachment"
                    type="file"
                    className="sr-only"
                    accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                    tabIndex={-1}
                    aria-invalid={Boolean(errors.attachment)}
                    onChange={(event) => {
                      selectFile(event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-44 w-full flex-col gap-3 whitespace-normal border-dashed p-5"
                    aria-controls="expense-attachment"
                    aria-describedby="expense-attachment-help"
                    aria-invalid={Boolean(errors.attachment)}
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (event.dataTransfer.files.length > 1)
                        setErrors((current) => ({
                          ...current,
                          attachment: "Vælg ét bilag pr. udgift.",
                        }));
                      else selectFile(event.dataTransfer.files[0]);
                    }}
                  >
                    <UploadCloudIcon data-icon="inline-start" />
                    <span>Træk fil hertil eller klik for at uploade</span>
                  </Button>
                  <FieldDescription id="expense-attachment-help">
                    PDF, JPG eller PNG. Højst{" "}
                    {shouldExport ? "9 MB til e-conomic" : "10 MB"}.
                  </FieldDescription>
                  <FieldError>{errors.attachment}</FieldError>
                </Field>
                {file ? (
                  <div className="flex min-w-0 items-center gap-3 rounded-lg border p-3">
                    <FileTextIcon
                      className="size-6 shrink-0"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{file.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {new Intl.NumberFormat("da-DK").format(
                          Math.ceil(file.size / 1024),
                        )}{" "}
                        KB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11 shrink-0"
                      aria-label="Fjern bilag"
                      onClick={() => {
                        setFile(null);
                        uploaded.current = null;
                        setErrors((current) => ({
                          ...current,
                          attachment: "",
                        }));
                      }}
                    >
                      <XIcon />
                    </Button>
                  </div>
                ) : null}
              </FieldGroup>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Kontering</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell>Lokation</TableCell>
                      <TableCell className="whitespace-normal">
                        {location?.name ?? "Vælg lokation"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Kategori</TableCell>
                      <TableCell>
                        {category?.label ?? "Vælg kategori"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Beløb inkl. moms</TableCell>
                      <TableCell className="tabular-nums">
                        {location && grossAmount !== null
                          ? formatExpenseAmount(grossAmount, location.currency)
                          : "Ikke angivet"}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Status</TableCell>
                      <TableCell>
                        <Badge variant={ready ? "secondary" : "outline"}>
                          {saving
                            ? "Registrerer…"
                            : ready
                              ? "Klar til registrering"
                              : "Udfyld detaljer"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
              {integrations?.economic && location?.economicConfigured && (exportAvailable || sendToEconomic) ? (
                <FieldGroup>
                  <Field
                    orientation="horizontal"
                    data-invalid={Boolean(errors.economic)}
                  >
                    <Checkbox
                      id="expense-economic"
                      checked={sendToEconomic}
                      disabled={saving || (!categoryMapped && !sendToEconomic)}
                      aria-invalid={Boolean(errors.economic)}
                      onCheckedChange={(checked) => {
                        setSendToEconomic(checked);
                        setErrors((current) => ({ ...current, economic: "" }));
                      }}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor="expense-economic">
                        Opret også i e-conomic
                      </FieldLabel>
                      <FieldDescription>
                        {!categoryId
                          ? "Vælg en kategori for at oprette en kladde i e-conomic."
                          : !categoryMapped
                            ? "Den valgte kategori mangler en konto i udgiftsindstillingerne."
                            : "Opretter udgiften som en kladde, der skal kontrolleres og bogføres i e-conomic."}
                      </FieldDescription>
                      <FieldError>{errors.economic}</FieldError>
                    </FieldContent>
                  </Field>
                </FieldGroup>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </fieldset>
      <AppBottomBar>
        <div className="mx-auto flex w-full max-w-[96rem] flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center">
          {navigation ? (
            <div className="min-w-0" inert={saving}>
              {navigation}
            </div>
          ) : null}
          <Button
            type="submit"
            className="h-12 w-full sm:ml-auto sm:w-auto sm:min-w-52"
            disabled={saving}
          >
            {saving ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <SaveIcon data-icon="inline-start" />
            )}
            Registrér udgift
          </Button>
        </div>
      </AppBottomBar>
    </form>
  );
}
