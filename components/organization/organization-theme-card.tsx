"use client";

import { useMutation } from "convex/react";
import { useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import {
  createCustomOrganizationTheme,
  defaultOrganizationTheme,
  getOrganizationThemeCssVariables,
  getOrganizationThemeError,
  normalizeOrganizationTheme,
  resolveOrganizationTheme,
  type OrganizationTheme,
} from "@/convex/lib/organizationTheme";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

const hexPattern = /^#[0-9A-Fa-f]{6}$/;

type ThemeColorKey =
  | "primary"
  | "primaryForeground"
  | "foreground"
  | "background"
  | "surface"
  | "muted"
  | "mutedForeground"
  | "accent"
  | "border";

function getThemeColor(theme: OrganizationTheme, key: ThemeColorKey) {
  if (key === "primary") return theme.primary;
  if (key === "foreground") return theme.foreground;
  if (key === "background") return theme.background;
  return theme.mode === "custom" ? theme[key] : "";
}

const automaticFields = [
  { key: "primary", label: "Primærfarve" },
  { key: "foreground", label: "Tekst" },
  { key: "background", label: "Baggrund" },
] as const;

const customFields = [
  { key: "primary", label: "Primærfarve" },
  { key: "primaryForeground", label: "Tekst på primærfarve" },
  { key: "background", label: "Baggrund" },
  { key: "foreground", label: "Tekst" },
  { key: "surface", label: "Kort og flader" },
  { key: "muted", label: "Dæmpede flader" },
  { key: "mutedForeground", label: "Dæmpet tekst" },
  { key: "accent", label: "Fremhævning" },
  { key: "border", label: "Kanter" },
] as const;

function ColorField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const valid = hexPattern.test(value);

  return (
    <Field data-invalid={!valid}>
      <FieldLabel htmlFor={`${id}-text`}>{label}</FieldLabel>
      <div className="flex gap-2">
        <Input
          id={`${id}-picker`}
          type="color"
          value={valid ? value : "#000000"}
          aria-label={`Vælg ${label.toLocaleLowerCase("da")}`}
          className="h-11 w-14 shrink-0 p-1"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <Input
          id={`${id}-text`}
          value={value}
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} som hex-kode`}
          aria-invalid={!valid}
          className="h-11 font-mono uppercase"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
      </div>
      <FieldError>
        {valid ? null : "Brug formatet #4F46E5"}
      </FieldError>
    </Field>
  );
}

function ThemePreview({ theme }: { theme: OrganizationTheme }) {
  const colors = resolveOrganizationTheme(theme);
  const swatch = [
    colors.chart1,
    colors.chart2,
    colors.chart3,
    colors.chart4,
    colors.chart5,
  ];

  return (
    <Card
      size="sm"
      style={getOrganizationThemeCssVariables(theme) as CSSProperties}
      className="bg-background text-foreground"
    >
      <CardHeader>
        <CardTitle>Forhåndsvisning</CardTitle>
        <CardDescription>
          Knapper, flader og tekst følger organisationens farver.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Farveskala fra primærfarven
          </p>
          <div className="grid grid-cols-5 overflow-hidden rounded-lg">
            {swatch.map((color, index) => (
              <span
                key={`${index}-${color}`}
                role="img"
                aria-label={`Farvetrin ${index + 1}: ${color}`}
                className="h-10"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm">
            Primær handling
          </Button>
          <Button type="button" size="sm" variant="secondary">
            Sekundær
          </Button>
          <Badge>Aktiv</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function OrganizationThemeCard({
  currentTheme,
}: {
  currentTheme: OrganizationTheme | null;
}) {
  const savedTheme = currentTheme ?? defaultOrganizationTheme;
  const setTheme = useMutation(api.organization.setTheme);
  const [draft, setDraft] = useState<OrganizationTheme>(savedTheme);
  const [saving, setSaving] = useState(false);
  const error = getOrganizationThemeError(draft);
  const validColors = Object.entries(draft).every(
    ([key, value]) => key === "mode" || hexPattern.test(value),
  );
  const previewTheme = validColors ? draft : savedTheme;
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedTheme);

  function changeMode(mode: "automatic" | "custom") {
    setDraft((theme) =>
      mode === "custom"
        ? createCustomOrganizationTheme(theme)
        : {
            mode: "automatic",
            primary: theme.primary,
            foreground: theme.foreground,
            background: theme.background,
          },
    );
  }

  function changeColor(key: ThemeColorKey, value: string) {
    setDraft((theme) => ({ ...theme, [key]: value }) as OrganizationTheme);
  }

  async function save() {
    if (error) return;
    setSaving(true);
    try {
      await setTheme({ theme: normalizeOrganizationTheme(draft) });
      toast.success("Organisationens farver er gemt");
    } catch (saveError) {
      toast.error(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : "Farverne kunne ikke gemmes. Prøv igen.",
      );
    } finally {
      setSaving(false);
    }
  }

  const fields = draft.mode === "automatic" ? automaticFields : customFields;

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>Farver</CardTitle>
        <CardDescription>
          Vælg en automatisk farveskala eller styr de enkelte farver selv.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <FieldGroup>
          <Field>
            <FieldTitle id="theme-mode-label">Tilstand</FieldTitle>
            <ToggleGroup
              value={[draft.mode]}
              variant="outline"
              spacing={0}
              aria-labelledby="theme-mode-label"
              className="w-full"
              onValueChange={(value) => {
                const mode = value[0];
                if (mode === "automatic" || mode === "custom") {
                  changeMode(mode);
                }
              }}
            >
              <ToggleGroupItem value="automatic" className="h-11 flex-1">
                Automatisk
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" className="h-11 flex-1">
                Fuldt tilpasset
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>

          {draft.mode === "automatic" ? (
            <p className="text-sm text-muted-foreground">
              Systemet tilpasser flader, kanter, fokusfarver og diagramfarver til
              de tre grundfarver.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Primærfarven danner fortsat farveskalaen til diagrammer og andre
              datavisninger.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <ColorField
                key={field.key}
                id={`organization-theme-${field.key}`}
                label={field.label}
                value={getThemeColor(draft, field.key)}
                onChange={(value) => changeColor(field.key, value)}
              />
            ))}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertTitle>
                {validColors
                  ? "Farverne mangler kontrast"
                  : "Kontrollér farverne"}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>

        <ThemePreview theme={previewTheme} />
      </CardContent>
      <CardFooter className="flex-col-reverse items-stretch gap-3 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => setDraft(defaultOrganizationTheme)}
        >
          Brug standardfarver
        </Button>
        <Button
          type="button"
          size="lg"
          disabled={!dirty || Boolean(error) || saving}
          onClick={save}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem farver
        </Button>
      </CardFooter>
    </Card>
  );
}
