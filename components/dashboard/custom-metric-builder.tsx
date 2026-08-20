"use client";

import { useEffect, useMemo, useState } from "react";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { useConvex, useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAccess } from "@/components/app-shell";
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
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { dashboardDatasets, type DashboardDataset } from "@/lib/dashboard/datasets";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import type {
  CustomMetricDatasetId,
  CustomMetricFilter,
  CustomMetricQuerySpec,
  CustomMetricSpec,
  DashboardRange,
  DashboardScope,
  MetricResult,
  VisualizationId,
} from "@/lib/dashboard/types";
import type { DataGranularity } from "@/lib/auth-permissions";

const NO_VALUE = "__none__";
const filterOperators = [
  { value: "in", label: "Er lig med" },
  { value: "notIn", label: "Er ikke lig med" },
] as const;

type FilterDraft = {
  field: string;
  op: CustomMetricFilter["op"];
  values: string;
};

type QueryDraft = {
  dataset: CustomMetricDatasetId;
  measure: string;
  filters: FilterDraft[];
};

export type CustomMetricDefinition = {
  id: Id<"customMetrics">;
  name: string;
  description: string | null;
  spec: CustomMetricSpec;
  sensitive: boolean;
  usageCount: number;
  updatedAt: number;
};

type CustomMetricBuilderProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: DashboardScope;
  range: DashboardRange;
  now: number;
  granularity?: DataGranularity;
  metric?: CustomMetricDefinition | null;
  mode?: "dashboard" | "library" | "widget";
  onSaved?: (metricId: Id<"customMetrics">) => void | Promise<void>;
};

function queryFromSpec(query: CustomMetricQuerySpec): QueryDraft {
  return {
    dataset: query.dataset,
    measure: query.measure,
    filters: query.filters.map((filter) => ({
      field: filter.field,
      op: filter.op,
      values: filter.values.join(", "),
    })),
  };
}

function defaultQuery(dataset: CustomMetricDatasetId): QueryDraft {
  const definition = dashboardDatasets[dataset];
  return {
    dataset,
    measure: definition.measures[0]?.id ?? "",
    filters: [],
  };
}

function initialDraft(metric?: CustomMetricDefinition | null) {
  if (!metric) {
    return {
      name: "",
      description: "",
      kind: "single" as const,
      numerator: defaultQuery("waste"),
      denominator: defaultQuery("waste"),
      dimension: "",
      bucket: "day" as const,
      limit: "10",
    };
  }
  const spec = metric.spec;
  return {
    name: metric.name,
    description: metric.description ?? "",
    kind: spec.kind,
    numerator: queryFromSpec(spec.kind === "single" ? spec.query : spec.numerator),
    denominator: queryFromSpec(spec.kind === "single" ? spec.query : spec.denominator),
    dimension: spec.dimension ?? "",
    bucket: spec.bucket,
    limit: String(spec.limit ?? 10),
  };
}

function parseValues(value: string) {
  return [...new Set(value.split(",").map((part) => part.trim()).filter(Boolean))];
}

function toQuerySpec(query: QueryDraft): CustomMetricQuerySpec {
  return {
    dataset: query.dataset,
    measure: query.measure,
    filters: query.filters.map((filter) => ({
      field: filter.field,
      op: filter.op,
      values: parseValues(filter.values),
    })),
  };
}

function selectValue(value: string) {
  return value || NO_VALUE;
}

function withoutNone(value: string) {
  return value === NO_VALUE ? "" : value;
}

function RegistrySelect({
  id,
  label,
  value,
  options,
  placeholder,
  help,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  onChange: (value: string) => void;
}) {
  const items = [
    ...(placeholder ? [{ value: NO_VALUE, label: placeholder }] : []),
    ...options,
  ];
  return (
    <Field>
      <div className="flex items-center gap-1">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {help ? <HelpTooltip label={label} content={help} /> : null}
      </div>
      <Select
        items={items}
        value={selectValue(value)}
        onValueChange={(next) => onChange(withoutNone(next ?? NO_VALUE))}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

function datasetOptions() {
  return (Object.values(dashboardDatasets) as DashboardDataset[]).map((dataset) => ({
    value: dataset.id,
    label: dataset.label,
  }));
}

function dimensionOptions(
  numerator: QueryDraft,
  denominator: QueryDraft,
  kind: "single" | "ratio",
  granularity?: DataGranularity,
) {
  const first = dashboardDatasets[numerator.dataset].dimensions.filter(
    (dimension) => granularity !== "anonymous" || !dimension.anonymous,
  );
  if (kind === "single") return first.map(({ id, label }) => ({ value: id, label }));
  const secondIds = new Set(
    dashboardDatasets[denominator.dataset].dimensions
      .filter((dimension) => granularity !== "anonymous" || !dimension.anonymous)
      .map((dimension) => dimension.id),
  );
  return first
    .filter((dimension) => secondIds.has(dimension.id))
    .map(({ id, label }) => ({ value: id, label }));
}

function queryValidation(query: QueryDraft, label: string) {
  const definition = dashboardDatasets[query.dataset];
  if (!query.measure || !definition.measures.some((measure) => measure.id === query.measure)) {
    return `${label}: vælg et mål`;
  }
  for (const filter of query.filters) {
    if (!definition.filters.some((field) => field.id === filter.field)) {
      return `${label}: vælg et gyldigt filterfelt`;
    }
    if (!parseValues(filter.values).length) {
      return `${label}: angiv mindst én filterværdi`;
    }
  }
  return null;
}

function metricError(error: unknown) {
  return error instanceof Error ? error.message : "Målingen kunne ikke gemmes";
}

function Preview({
  result,
  loading,
  error,
  visualization,
}: {
  result: MetricResult | null;
  loading: boolean;
  error: string | null;
  visualization: VisualizationId;
}) {
  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Forhåndsvisningen kunne ikke indlæses</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!result) return <Skeleton className="h-56 w-full" />;
  const Visualization = visualizationRegistry[visualization];
  return (
    <div className="h-56 rounded-lg border bg-card p-4" aria-busy={loading}>
      <Visualization result={result} />
      {loading ? <span className="sr-only" role="status">Opdaterer forhåndsvisning</span> : null}
    </div>
  );
}

export function CustomMetricBuilder({
  open,
  onOpenChange,
  scope,
  range,
  now,
  granularity,
  metric,
  mode = "dashboard",
  onSaved,
}: CustomMetricBuilderProps) {
  const access = useAccess();
  const effectiveGranularity = granularity ?? access?.granularity;
  const convex = useConvex();
  const createMetric = useMutation(api.customMetrics.create);
  const updateMetric = useMutation(api.customMetrics.update);
  const [draft, setDraft] = useState(() => initialDraft(metric));
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<MetricResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const numeratorDefinition = dashboardDatasets[draft.numerator.dataset];
  const denominatorDefinition = dashboardDatasets[draft.denominator.dataset];
  const dimensions = dimensionOptions(
    draft.numerator,
    draft.denominator,
    draft.kind,
    effectiveGranularity,
  );
  const spec = useMemo<CustomMetricSpec | null>(() => {
    const numeratorError = queryValidation(draft.numerator, draft.kind === "ratio" ? "Tæller" : "Måling");
    const denominatorError = draft.kind === "ratio"
      ? queryValidation(draft.denominator, "Nævner")
      : null;
    const limit = Number(draft.limit);
    if (
      numeratorError ||
      denominatorError ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (draft.dimension && !dimensions.some((option) => option.value === draft.dimension))
    ) {
      return null;
    }
    const base = {
      dimension: draft.dimension || undefined,
      bucket: draft.bucket,
      limit,
    } as const;
    if (draft.kind === "single") {
      return { kind: "single", query: toQuerySpec(draft.numerator), ...base };
    }
    return {
      kind: "ratio",
      numerator: toQuerySpec(draft.numerator),
      denominator: toQuerySpec(draft.denominator),
      ...base,
    };
  }, [dimensions, draft]);

  const localValidationError = !draft.name.trim()
    ? "Giv målingen et navn"
    : draft.name.trim().length > 100
      ? "Navnet må højst være 100 tegn"
      : queryValidation(draft.numerator, draft.kind === "ratio" ? "Tæller" : "Måling")
        ?? (draft.kind === "ratio" ? queryValidation(draft.denominator, "Nævner") : null)
        ?? (!spec ? "Kontrollér målingens felter og grænse" : null);

  useEffect(() => {
    if (!open || !spec) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setPreviewLoading(true);
      setPreviewError(null);
      void convex
        .query(api.customMetrics.preview, {
          spec,
          visualization: "kpi",
          scope,
          range,
          now,
        })
        .then((result) => {
          if (!active) return;
          setPreview(result);
          setPreviewLoading(false);
        })
        .catch((error: unknown) => {
          if (!active) return;
          setPreview(null);
          setPreviewError(metricError(error));
          setPreviewLoading(false);
        });
    }, 450);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [convex, now, open, range, scope, spec]);

  function updateQuery(which: "numerator" | "denominator", next: Partial<QueryDraft>) {
    setDraft((current) => ({
      ...current,
      [which]: {
        ...current[which],
        ...next,
      },
    }));
  }

  function chooseDataset(which: "numerator" | "denominator", dataset: string) {
    if (!(dataset in dashboardDatasets)) return;
    const next = defaultQuery(dataset as CustomMetricDatasetId);
    updateQuery(which, next);
    setDraft((current) => {
      const nextDimensions = dimensionOptions(
        which === "numerator" ? next : current.numerator,
        which === "denominator" ? next : current.denominator,
        current.kind,
        effectiveGranularity,
      );
      return nextDimensions.some((option) => option.value === current.dimension)
        ? current
        : { ...current, dimension: "" };
    });
  }

  function addFilter(which: "numerator" | "denominator") {
    const query = draft[which];
    const firstField = dashboardDatasets[query.dataset].filters[0]?.id ?? "";
    updateQuery(which, {
      filters: [...query.filters, { field: firstField, op: "in", values: "" }],
    });
  }

  function updateFilter(
    which: "numerator" | "denominator",
    index: number,
    patch: Partial<FilterDraft>,
  ) {
    const query = draft[which];
    updateQuery(which, {
      filters: query.filters.map((filter, filterIndex) =>
        filterIndex === index ? { ...filter, ...patch } : filter,
      ),
    });
  }

  function removeFilter(which: "numerator" | "denominator", index: number) {
    const query = draft[which];
    updateQuery(which, { filters: query.filters.filter((_, filterIndex) => filterIndex !== index) });
  }

  async function save() {
    if (!spec || localValidationError) {
      toast.error(localValidationError ?? "Kontrollér målingens felter");
      return;
    }
    setSaving(true);
    try {
      const id = metric
        ? await updateMetric({
            metricId: metric.id,
            name: draft.name,
            description: draft.description || undefined,
            spec,
            expectedUpdatedAt: metric.updatedAt,
          }).then(() => metric.id)
        : await createMetric({
            name: draft.name,
            description: draft.description || undefined,
            spec,
          });
      toast.success(metric ? "Målingen er opdateret" : "Målingen er oprettet");
      onOpenChange(false);
      await onSaved?.(id);
    } catch (error) {
      toast.error(metricError(error));
    } finally {
      setSaving(false);
    }
  }

  function renderQuery(which: "numerator" | "denominator", title: string, definition: DashboardDataset) {
    const query = draft[which];
    const fields = definition.filters;
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Vælg kun felter fra datasættets registrerede muligheder.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <RegistrySelect
                id={`${which}-dataset`}
                label="Datasæt"
                value={query.dataset}
                options={datasetOptions()}
                onChange={(value) => chooseDataset(which, value)}
              />
              <RegistrySelect
                id={`${which}-measure`}
                label="Mål"
                value={query.measure}
                options={definition.measures.map(({ id, label }) => ({ value: id, label }))}
                onChange={(value) => updateQuery(which, { measure: value })}
              />
            </div>
            {fields.length ? (
              <FieldSet className="gap-3">
                <FieldLegend variant="label">Filtre</FieldLegend>
                {!query.filters.length ? <FieldDescription>Ingen filtre valgt.</FieldDescription> : null}
                {query.filters.map((filter, index) => (
                  <FieldGroup key={`${which}-filter-${index}`} className="grid items-start gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_auto]">
                    <RegistrySelect
                      id={`${which}-filter-${index}-field`}
                      label="Felt"
                      value={filter.field}
                      options={fields.map(({ id, label }) => ({ value: id, label }))}
                      onChange={(value) => updateFilter(which, index, { field: value })}
                    />
                    <RegistrySelect
                      id={`${which}-filter-${index}-operator`}
                      label="Operator"
                      value={filter.op}
                      options={filterOperators}
                      onChange={(value) => updateFilter(which, index, { op: value as FilterDraft["op"] })}
                    />
                    <Field>
                      <FieldLabel htmlFor={`${which}-filter-${index}-values`}>Værdier</FieldLabel>
                      <Input
                        id={`${which}-filter-${index}-values`}
                        value={filter.values}
                        placeholder="fx aktiv, manuel"
                        onChange={(event) => updateFilter(which, index, { values: event.target.value })}
                      />
                      <FieldDescription>Flere værdier adskilles med komma.</FieldDescription>
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-lg"
                      className="min-h-11 md:mt-7"
                      aria-label="Fjern filter"
                      onClick={() => removeFilter(which, index)}
                    >
                      <Trash2Icon />
                    </Button>
                  </FieldGroup>
                ))}
                <Button type="button" variant="outline" className="min-h-11 self-start" onClick={() => addFilter(which)}>
                  <PlusIcon data-icon="inline-start" />
                  Tilføj filter
                </Button>
              </FieldSet>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100vh-2rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{metric ? "Redigér tilpasset måling" : "Opret tilpasset måling"}</DialogTitle>
          <DialogDescription>
            {metric
              ? "Redigér de delte data. Ændringerne gælder alle widgets, der bruger målingen."
              : "Opret en måling ud fra organisationens tilgængelige datasæt. Vælg visualisering og størrelse bagefter."}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-1">
          <form id="custom-metric-builder-form" className="flex flex-col gap-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <Card>
              <CardHeader>
                <CardTitle>Grundoplysninger</CardTitle>
                <CardDescription>Navnet vises i widgetlisten og i organisationens målingsbibliotek.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field data-invalid={!draft.name.trim()}>
                      <FieldLabel htmlFor="custom-metric-name">Navn</FieldLabel>
                      <Input
                        id="custom-metric-name"
                        value={draft.name}
                        maxLength={100}
                        aria-invalid={!draft.name.trim()}
                        placeholder="fx Waste pr. lokation"
                        onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="custom-metric-description">Beskrivelse</FieldLabel>
                      <Textarea
                        id="custom-metric-description"
                        value={draft.description}
                        maxLength={500}
                        placeholder="Forklar kort, hvad målingen viser"
                        onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                      />
                    </Field>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="custom-metric-kind">Type</FieldLabel>
                    <ToggleGroup
                      id="custom-metric-kind"
                      value={[draft.kind]}
                      onValueChange={(value) => {
                        const nextKind = value[0] as "single" | "ratio" | undefined;
                        if (!nextKind) return;
                        setDraft((current) => ({
                          ...current,
                          kind: nextKind,
                          dimension: "",
                        }));
                      }}
                      aria-label="Målingstype"
                      variant="outline"
                    >
                      <ToggleGroupItem value="single">Enkeltmåling</ToggleGroupItem>
                      <ToggleGroupItem value="ratio">Forhold</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>

            {renderQuery("numerator", draft.kind === "ratio" ? "Tæller" : "Måling", numeratorDefinition)}
            {draft.kind === "ratio" ? renderQuery("denominator", "Nævner", denominatorDefinition) : null}

            <Card>
              <CardHeader>
                <CardTitle>Datagruppering</CardTitle>
                <CardDescription>Widgettens visualisering og størrelse vælges bagefter.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <FieldGroup className="grid gap-4 md:grid-cols-3">
                    <RegistrySelect
                      id="custom-metric-dimension"
                      label="Dimension"
                      value={draft.dimension}
                      options={dimensions}
                      placeholder="Ingen dimension"
                      help="Opdel målingen i grupper, for eksempel efter lokation, produkt eller rolle."
                      onChange={(value) => setDraft((current) => ({ ...current, dimension: value }))}
                    />
                    <RegistrySelect
                      id="custom-metric-bucket"
                      label="Tidsopdeling"
                      value={draft.bucket}
                      options={[
                        { value: "day", label: "Dag" },
                        { value: "week", label: "Uge" },
                        { value: "month", label: "Måned" },
                      ]}
                      help="Bestem om datapunkterne samles pr. dag, uge eller måned."
                      onChange={(value) => setDraft((current) => ({ ...current, bucket: value as "day" | "week" | "month" }))}
                    />
                    <Field>
                      <div className="flex items-center gap-1">
                        <FieldLabel htmlFor="custom-metric-limit">Grænse</FieldLabel>
                        <HelpTooltip label="Grænse" content="Vis kun de største grupper. Resten samles under Andre." />
                      </div>
                      <Input
                        id="custom-metric-limit"
                        type="number"
                        min={1}
                        max={50}
                        step={1}
                        value={draft.limit}
                        aria-describedby="custom-metric-limit-description"
                        onChange={(event) => setDraft((current) => ({ ...current, limit: event.target.value }))}
                      />
                      <FieldDescription id="custom-metric-limit-description">Top 1–50 grupper.</FieldDescription>
                    </Field>
                  </FieldGroup>
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Forhåndsvisning</CardTitle>
                <CardDescription>Opdateres automatisk kort efter en ændring i målingen.</CardDescription>
              </CardHeader>
              <CardContent>
                <Preview result={preview} loading={previewLoading} error={previewError} visualization="kpi" />
              </CardContent>
              {effectiveGranularity === "anonymous" ? (
                <CardFooter>
                  <p className="text-sm text-muted-foreground">Persondimensioner er skjult for din adgangsgrad.</p>
                </CardFooter>
              ) : null}
            </Card>
          </form>
        </div>
        <DialogFooter className="flex-col items-stretch sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-destructive sm:max-w-md" role="status">{localValidationError ?? ""}</p>
          <div className="flex gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annullér</Button>
            <Button type="submit" form="custom-metric-builder-form" disabled={saving || Boolean(localValidationError)}>
              {metric || mode === "widget" ? "Gem ændringer" : mode === "dashboard" ? "Gem og fortsæt" : "Gem måling"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
