"use client";

import {
  TagsInputInput,
  TagsInputItem,
  TagsInputItemDelete,
  TagsInputItemText,
  TagsInputRoot,
} from "@diceui/tags-input";
import { useMutation, useQuery } from "convex/react";
import { XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useAccess, usePermission } from "@/components/app-shell";

type Period = "allTime" | "30Days" | "90Days";
type HistoryScope = "location" | "organization";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBJECT_LENGTH = 200;
const MAX_BODY_LENGTH = 5_000;
const periodItems = [
  { value: "allTime", label: "Al tid" },
  { value: "30Days", label: "Seneste 30 dage" },
  { value: "90Days", label: "Seneste 90 dage" },
] satisfies Array<{ value: Period; label: string }>;

function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Indstillingerne kunne ikke gemmes";
}

function recipientLists(to: string[], cc: string[], bcc: string[]) {
  const normalize = (values: string[]) =>
    values.map((email) => email.trim()).filter(Boolean);
  const lists = { to: normalize(to), cc: normalize(cc), bcc: normalize(bcc) };
  const all = [...lists.to, ...lists.cc, ...lists.bcc];
  if (all.length > 50) throw new Error("Der kan højst angives 50 modtagere");
  if (all.some((email) => !EMAIL.test(email))) {
    throw new Error("En eller flere e-mailadresser er ugyldige");
  }
  if (new Set(all.map((email) => email.toLowerCase())).size !== all.length) {
    throw new Error("Den samme e-mailadresse må kun angives én gang");
  }
  return lists;
}

function recipientError(email: string, existing: string[]) {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL.test(email.trim())) return "E-mailadressen er ugyldig";
  if (existing.some((item) => item.toLowerCase() === normalized)) {
    return "E-mailadressen er allerede tilføjet";
  }
  if (existing.length >= 50) return "Der kan højst angives 50 modtagere";
  return null;
}

function RecipientInput({
  id,
  label,
  value,
  otherValues,
  onChange,
  placeholder,
  description,
}: {
  id: string;
  label: string;
  value: string[];
  otherValues: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  description?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  function validate(email: string, current = value) {
    const nextError = recipientError(email, [...current, ...otherValues]);
    setError(nextError);
    return nextError === null;
  }

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <TagsInputRoot
        value={value}
        onValueChange={(items) => {
          onChange(items.map((email) => email.trim()));
          setError(null);
        }}
        onValidate={validate}
        onInvalid={(email) =>
          setError(
            recipientError(email, [...value, ...otherValues]) ??
              "E-mailadressen kunne ikke tilføjes",
          )
        }
        addOnPaste
        addOnTab
        blurBehavior="add"
        delimiter=","
        max={Math.max(0, 50 - otherValues.length)}
        data-invalid={error ? "" : undefined}
        className="flex min-h-11 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input px-2.5 py-2 text-sm transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 data-[invalid]:border-destructive data-[invalid]:ring-3 data-[invalid]:ring-destructive/20"
      >
        {value.map((email) => (
          <TagsInputItem
            key={email.toLowerCase()}
            value={email}
            className="inline-flex h-7 max-w-full items-center gap-1 rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground"
          >
            <TagsInputItemText className="truncate" />
            <TagsInputItemDelete
              className="rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-labelledby=""
              aria-label={`Fjern ${email}`}
            >
              <XIcon aria-hidden="true" />
            </TagsInputItemDelete>
          </TagsInputItem>
        ))}
        <TagsInputInput
          id={id}
          aria-labelledby={`${id}-label`}
          aria-invalid={Boolean(error)}
          placeholder={value.length ? "Tilføj flere" : placeholder}
          className="h-7 min-w-40 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          onKeyDown={(event) => {
            if (event.key !== " " || !event.currentTarget.value.trim()) return;
            event.preventDefault();
            event.currentTarget.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
              }),
            );
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text");
            if (!/[,;\n]/.test(pasted)) return;
            event.preventDefault();
            const additions = pasted
              .split(/[,;\n]/)
              .map((email) => email.trim())
              .filter(Boolean);
            const next = [...value];
            for (const email of additions) {
              if (!validate(email, next)) return;
              next.push(email);
            }
            onChange(next);
            setError(null);
          }}
        />
      </TagsInputRoot>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function WasteSettings() {
  const access = useAccess();
  const canManage = usePermission("waste.settings");
  const settings = useQuery(api.waste.getSettings, canManage ? {} : "skip");
  const saveSettings = useMutation(api.waste.setSettings);
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);
  const [periodDraft, setPeriodDraft] = useState<Period | null>(null);
  const [historyScopeDraft, setHistoryScopeDraft] =
    useState<HistoryScope | null>(null);
  const [deductDraft, setDeductDraft] = useState<boolean | null>(null);
  const [showChoiceDraft, setShowChoiceDraft] = useState<boolean | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [toDraft, setToDraft] = useState<string[] | null>(null);
  const [ccDraft, setCcDraft] = useState<string[] | null>(null);
  const [bccDraft, setBccDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState<"waste" | "badDelivery" | null>(null);

  if (!access) return <Skeleton className="h-72 max-w-3xl" />;
  if (!canManage) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre spildindstillinger.
        </AlertDescription>
      </Alert>
    );
  }
  if (settings === undefined) return <Skeleton className="h-72 max-w-3xl" />;

  const seconds = secondsDraft ?? String(settings.inactivitySeconds);
  const period = periodDraft ?? settings.popularityPeriod;
  const historyScope = historyScopeDraft ?? settings.historyScope;
  const deduct = deductDraft ?? settings.badDeliveryDeductFromStock;
  const showChoice = showChoiceDraft ?? settings.badDeliveryShowStockChoice;
  const subject = subjectDraft ?? settings.badDeliveryEmailSubject;
  const body = bodyDraft ?? settings.badDeliveryEmailBody;
  const to = toDraft ?? settings.badDeliveryTo;
  const cc = ccDraft ?? settings.badDeliveryCc;
  const bcc = bccDraft ?? settings.badDeliveryBcc;

  function basePayload() {
    const inactivitySeconds = Number(seconds);
    if (
      !Number.isInteger(inactivitySeconds) ||
      inactivitySeconds < 5 ||
      inactivitySeconds > 3600
    ) {
      throw new Error("Inaktivitet skal være mellem 5 og 3600 sekunder");
    }
    const recipients = recipientLists(to, cc, bcc);
    const emailSubject = subject.trim();
    if (!emailSubject || emailSubject.length > MAX_SUBJECT_LENGTH) {
      throw new Error("E-mailens emne skal være mellem 1 og 200 tegn");
    }
    const emailBody = body.trim();
    if (!emailBody || emailBody.length > MAX_BODY_LENGTH) {
      throw new Error("E-mailens indhold skal være mellem 1 og 5000 tegn");
    }
    return {
      inactivitySeconds,
      popularityPeriod: period,
      historyScope,
      badDeliveryDeductFromStock: deduct,
      badDeliveryShowStockChoice: showChoice,
      badDeliveryTo: recipients.to,
      badDeliveryCc: recipients.cc,
      badDeliveryBcc: recipients.bcc,
      badDeliveryEmailSubject: emailSubject,
      badDeliveryEmailBody: emailBody,
    };
  }

  async function save(kind: "waste" | "badDelivery") {
    try {
      const payload = basePayload();
      setSaving(kind);
      await saveSettings(payload);
      if (kind === "waste") {
        setSecondsDraft(null);
        setPeriodDraft(null);
        setHistoryScopeDraft(null);
      } else {
        setDeductDraft(null);
        setShowChoiceDraft(null);
        setSubjectDraft(null);
        setBodyDraft(null);
        setToDraft(null);
        setCcDraft(null);
        setBccDraft(null);
      }
      toast.success("Spildindstillingerne er gemt");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Spildindstillinger</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="waste-inactivity">
                    Nulstil efter inaktivitet
                  </FieldLabel>
                  <HelpTooltip
                    label="Nulstil efter inaktivitet"
                    content="Efter denne tid åbnes Registrér med Alle produkter, tom søgning og lukkede dialoger."
                  />
                </div>
              </FieldContent>
              <div className="flex items-center gap-2">
                <Input
                  id="waste-inactivity"
                  className="w-28"
                  type="number"
                  min="5"
                  max="3600"
                  step="1"
                  value={seconds}
                  onChange={(event) => setSecondsDraft(event.target.value)}
                />
                <span className="text-sm text-muted-foreground">sekunder</span>
              </div>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="waste-popularity-period">Popularitetsperiode</FieldLabel>
              </FieldContent>
              <Select
                items={periodItems}
                value={period}
                onValueChange={(value) => setPeriodDraft(value as Period)}
              >
                <SelectTrigger id="waste-popularity-period" className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {periodItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="waste-organization-history">
                    Brug historik fra hele organisationen
                  </FieldLabel>
                  <HelpTooltip
                    label="historik fra hele organisationen"
                    content="Når indstillingen er slået til, bruges spild fra alle lokationer til popularitet og anbefalede genveje. Når den er slået fra, bruges kun historikken fra den valgte lokation."
                  />
                </div>
              </FieldContent>
              <Switch
                id="waste-organization-history"
                checked={historyScope === "organization"}
                onCheckedChange={(checked) =>
                  setHistoryScopeDraft(checked ? "organization" : "location")
                }
              />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button disabled={saving !== null} onClick={() => void save("waste")}>
            {saving === "waste" ? <Spinner data-icon="inline-start" /> : null}
            Gem indstillinger
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dårlige leveringer</CardTitle>
          <CardDescription>
            Vælg lageradfærd og modtagere af automatiske meddelelser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="bad-delivery-deduct">
                  Træk som standard fra lager
                </FieldLabel>
              </FieldContent>
              <Switch
                id="bad-delivery-deduct"
                checked={deduct}
                onCheckedChange={setDeductDraft}
              />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldLabel htmlFor="bad-delivery-show-choice">
                  Vis valget ved registrering
                </FieldLabel>
              </FieldContent>
              <Switch
                id="bad-delivery-show-choice"
                checked={showChoice}
                onCheckedChange={setShowChoiceDraft}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="bad-delivery-subject">
                  E-mailens emne
                </FieldLabel>
                <HelpTooltip
                  label="E-mailens emne"
                  content="Brug {location} for lokationens navn og {date} for registreringens dato og tidspunkt."
                />
              </div>
              <Input
                id="bad-delivery-subject"
                value={subject}
                maxLength={MAX_SUBJECT_LENGTH}
                onChange={(event) => setSubjectDraft(event.target.value)}
              />
            </Field>
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="bad-delivery-body">
                  E-mailens indhold
                </FieldLabel>
                <HelpTooltip
                  label="E-mailens indhold"
                  content="Gælder den oprindelige meddelelse. Linjeskift bevares. Brug {reference}, {location}, {date}, {registrar}, {products}, {comment} og {stock} til registreringens oplysninger."
                />
              </div>
              <Textarea
                id="bad-delivery-body"
                value={body}
                maxLength={MAX_BODY_LENGTH}
                rows={10}
                onChange={(event) => setBodyDraft(event.target.value)}
              />
              <FieldDescription>{body.length}/5000 tegn</FieldDescription>
            </Field>
            <RecipientInput
              id="bad-delivery-to"
              label="Til"
              value={to}
              otherValues={[...cc, ...bcc]}
              onChange={setToDraft}
              placeholder="modtager@eksempel.dk"
              description="Tom liste deaktiverer automatiske meddelelser."
            />
            <RecipientInput
              id="bad-delivery-cc"
              label="CC"
              value={cc}
              otherValues={[...to, ...bcc]}
              onChange={setCcDraft}
              placeholder="kopi@eksempel.dk"
            />
            <RecipientInput
              id="bad-delivery-bcc"
              label="BCC"
              value={bcc}
              otherValues={[...to, ...cc]}
              onChange={setBccDraft}
              placeholder="skjult@eksempel.dk"
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            disabled={saving !== null}
            onClick={() => void save("badDelivery")}
          >
            {saving === "badDelivery" ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Gem indstillinger
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
