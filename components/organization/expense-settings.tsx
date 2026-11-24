"use client";

import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { SortableListRow, sortableListInstructions } from "@/components/organization/sortable-list-row";
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
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { FormCardSkeleton } from "@/components/page-skeletons";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { MAX_EXPENSE_CATEGORIES } from "@/lib/expenses";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useActiveOrganization } from "@/lib/active-organization";

type Settings = FunctionReturnType<typeof api.expenses.getSettings>;
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
  const organizationId = useActiveOrganization().data?.id;
  if (!organizationId) return <FormCardSkeleton className="max-w-3xl" />;
  return (
    <ExpenseSettingsControl
      key={`${organizationId}:${session?.user.id}`}
      organizationId={organizationId}
    />
  );
}

function ExpenseSettingsControl({ organizationId }: { organizationId: string }) {
  const access = useAccess();
  const canManage = usePermission("expenses.settings");
  const canToggle = usePermission("organization.settings");
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
  const [categoriesDraft, setCategoriesDraft] = useState<Settings["categories"] | null>(null);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!access) return <FormCardSkeleton className="max-w-3xl" />;
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
    return <FormCardSkeleton className="max-w-3xl" />;
  }

  const loadedSettings = settings;
  const to = toDraft ?? settings.to.join(", ");
  const cc = ccDraft ?? settings.cc.join(", ");
  const bcc = bccDraft ?? settings.bcc.join(", ");
  const categories = categoriesDraft ?? settings.categories.filter((category) => category.enabled);
  const deletingCategory = categories.find((category) => category.id === deletingCategoryId);
  async function save() {
    if (saving) return;
    setError(null);
    try {
      const recipients = readRecipients(to, cc, bcc);
      setSaving(true);
      await saveSettings({
        expectedOrganizationId: loadedSettings.organizationId,
        ...recipients,
        categories: categoriesDraft ?? undefined,
      });
      setToDraft(null);
      setCcDraft(null);
      setBccDraft(null);
      setCategoriesDraft(null);
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
          <CardTitle appearance="compact" className="flex items-center">
            Kategorier
            <HelpTooltip
              label="udgiftskategorier"
              content={`Træk kategorierne for at ændre rækkefølgen ved oprettelse af udgifter. Du kan tilføje, omdøbe og slette kategorier. Gemte udgifter beholder deres oprindelige kategorinavn. Der skal være mindst én kategori og højst ${MAX_EXPENSE_CATEGORIES}.`}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DndContext
            accessibility={{
              screenReaderInstructions: sortableListInstructions,
              announcements: {
                onDragStart: ({ active }) => `${categories.find((category) => category.id === active.id)?.label || "Kategorien"} er valgt.`,
                onDragOver: ({ over }) => over ? `Flyttes til plads ${categories.findIndex((category) => category.id === over.id) + 1}.` : undefined,
                onDragEnd: () => "Kategorien er placeret.",
                onDragCancel: () => "Flytning af kategorien blev annulleret.",
              },
            }}
            collisionDetection={closestCorners}
            sensors={sensors}
            onDragEnd={({ active, over }) => {
              if (saving || !over || active.id === over.id) return;
              const from = categories.findIndex((category) => category.id === active.id);
              const to = categories.findIndex((category) => category.id === over.id);
              if (from >= 0 && to >= 0) setCategoriesDraft(arrayMove(categories, from, to));
            }}
          >
            <SortableContext items={categories} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-2" aria-label="Rækkefølge af udgiftskategorier">
                {categories.map((category, index) => (
                  <SortableListRow
                    key={category.id}
                    id={category.id}
                    label={category.label || "kategori"}
                    disabled={saving}
                    roleDescription="kategori, der kan flyttes"
                    actions={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Slet kategori ${category.label}`}
                        disabled={saving || categories.length === 1}
                        onClick={() => setDeletingCategoryId(category.id)}
                      >
                        <Trash2Icon />
                      </Button>
                    }
                  >
                    <Field data-disabled={saving} className="min-w-0 flex-1">
                      <FieldLabel htmlFor={`expense-category-${category.id}`} className="sr-only">
                        Kategorinavn {index + 1}
                      </FieldLabel>
                      <Input
                        id={`expense-category-${category.id}`}
                        className="h-11"
                        value={category.label}
                        placeholder="Kategorinavn"
                        required
                        maxLength={100}
                        disabled={saving}
                        onChange={(event) => setCategoriesDraft(categories.map((item) =>
                          item.id === category.id ? { ...item, label: event.target.value } : item,
                        ))}
                      />
                    </Field>
                  </SortableListRow>
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving || categories.length >= MAX_EXPENSE_CATEGORIES}
            onClick={() => setCategoriesDraft([
              ...categories,
              { id: crypto.randomUUID(), label: "", enabled: true },
            ])}
          >
            <PlusIcon data-icon="inline-start" />
            Tilføj kategori
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={Boolean(deletingCategory)} onOpenChange={(open) => { if (!open) setDeletingCategoryId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet kategori?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCategory?.label || "Kategorien"} fjernes fra nye udgifter, når du gemmer indstillingerne. Gemte udgifter beholder deres kategorinavn.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Annullér</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              onClick={() => {
                setCategoriesDraft(categories.filter((category) => category.id !== deletingCategoryId));
                setDeletingCategoryId(null);
              }}
            >
              Slet kategori
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
