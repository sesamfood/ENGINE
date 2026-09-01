"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  CheckIcon,
  ClipboardIcon,
  EditIcon,
  KeyRoundIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type LocationPolicy =
  | { kind: "all" }
  | { kind: "selected"; locationIds: Id<"locations">[] }
  | { kind: "operator"; operatorId: Id<"operators"> };

type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  start: string;
  role: string;
  permissions: string[];
  locationPolicy: LocationPolicy;
  status: "active" | "revoked" | "expired";
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  revision: number;
};

type RoleOption = {
  key: string;
  name: string;
  granularity: "detail" | "aggregate" | "anonymous";
  permissions: string[];
};

type AdminOptions = {
  roles: RoleOption[];
  permissionGroups: Array<{
    group: string;
    permissions: Array<{ id: string; label: string }>;
  }>;
  locations: Array<{ id: Id<"locations">; name: string }>;
  operators: Array<{ id: Id<"operators">; name: string }>;
  defaultRole: string;
  canGrantAllLocations: boolean;
};

type PolicyDraft = {
  role: string;
  permissions: string[];
  locationPolicy: LocationPolicy;
};

type SecretDialog = {
  secret: string;
  name: string;
  action: "oprettet" | "roteret";
};

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
});
const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toDateInput(value: number) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateInput(date.getTime());
}

function dateInputToExpiry(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 23, 59, 59, 999).getTime();
}

function locationPolicyLabel(
  policy: LocationPolicy,
  options: AdminOptions | undefined,
) {
  if (policy.kind === "all") return "Alle lokationer";
  if (policy.kind === "selected") {
    return `${policy.locationIds.length} valgt${policy.locationIds.length === 1 ? " lokation" : "e lokationer"}`;
  }
  return (
    options?.operators.find((operator) => operator.id === policy.operatorId)
      ?.name ?? "Operatørens lokationer"
  );
}

function statusLabel(status: ApiKey["status"]) {
  if (status === "active") return "Aktiv";
  if (status === "expired") return "Udløbet";
  return "Tilbagekaldt";
}

function statusVariant(status: ApiKey["status"]) {
  if (status === "active") return "secondary" as const;
  if (status === "expired") return "outline" as const;
  return "destructive" as const;
}

function roleName(role: string, options: AdminOptions | undefined) {
  return options?.roles.find((item) => item.key === role)?.name ?? role;
}

function draftFromKey(key: ApiKey): PolicyDraft {
  return {
    role: key.role,
    permissions: [...key.permissions],
    locationPolicy:
      key.locationPolicy.kind === "selected"
        ? { kind: "selected", locationIds: [...key.locationPolicy.locationIds] }
        : { ...key.locationPolicy },
  };
}

function initialDraft(options: AdminOptions): PolicyDraft {
  const role =
    options.roles.find((item) => item.key === options.defaultRole) ??
    options.roles[0];
  return {
    role: role?.key ?? "",
    permissions: role?.permissions ?? [],
    locationPolicy: options.canGrantAllLocations
      ? { kind: "all" }
      : {
          kind: "selected",
          locationIds: options.locations[0] ? [options.locations[0].id] : [],
        },
  };
}

function PermissionFields({
  draft,
  options,
  disabled,
  onChange,
}: {
  draft: PolicyDraft;
  options: AdminOptions;
  disabled: boolean;
  onChange: (draft: PolicyDraft) => void;
}) {
  const rolePermissions = new Set(
    options.roles.find((role) => role.key === draft.role)?.permissions ?? [],
  );
  return (
    <FieldSet>
      <FieldLegend variant="label">Tilladelser</FieldLegend>
      <FieldDescription>
        Start med rollens tilladelser, og fjern de handlinger API-nøglen ikke
        skal kunne udføre.
      </FieldDescription>
      <div className="grid gap-4 sm:grid-cols-2">
        {options.permissionGroups
          .filter((group) =>
            group.permissions.some((permission) =>
              rolePermissions.has(permission.id),
            ),
          )
          .map((group) => (
          <FieldSet key={group.group} className="gap-2 rounded-lg border p-3">
            <FieldLegend variant="label" className="text-sm">
              {group.group}
            </FieldLegend>
            {group.permissions
              .filter((permission) => rolePermissions.has(permission.id))
              .map((permission) => {
              const id = `api-key-permission-${permission.id.replace(/[^a-zA-Z0-9]/g, "-")}`;
              return (
                <Field key={permission.id} orientation="horizontal">
                  <Checkbox
                    id={id}
                    checked={draft.permissions.includes(permission.id)}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      const permissions = new Set(draft.permissions);
                      if (checked === true) permissions.add(permission.id);
                      else permissions.delete(permission.id);
                      onChange({ ...draft, permissions: [...permissions] });
                    }}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={id}>{permission.label}</FieldLabel>
                  </FieldContent>
                </Field>
              );
              })}
          </FieldSet>
          ))}
      </div>
    </FieldSet>
  );
}

function PolicyFields({
  draft,
  options,
  disabled,
  onChange,
}: {
  draft: PolicyDraft;
  options: AdminOptions;
  disabled: boolean;
  onChange: (draft: PolicyDraft) => void;
}) {
  const role = options.roles.find((item) => item.key === draft.role);
  const selectedLocations =
    draft.locationPolicy.kind === "selected"
      ? draft.locationPolicy.locationIds
      : [];

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="api-key-role">Rolle</FieldLabel>
        <Select
          value={draft.role}
          onValueChange={(value) => {
            if (!value) return;
            const nextRole = options.roles.find((item) => item.key === value);
            onChange({
              ...draft,
              role: value,
              permissions: nextRole?.permissions ?? [],
            });
          }}
          disabled={disabled}
        >
          <SelectTrigger id="api-key-role" className="w-full">
            <SelectValue placeholder="Vælg rolle" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Roller</SelectLabel>
              {options.roles.map((item) => (
                <SelectItem key={item.key} value={item.key}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {role ? (
          <FieldDescription>
            {role.granularity === "detail"
              ? "Adgang til detaljerede data."
              : role.granularity === "aggregate"
                ? "Adgang til samlede data."
                : "Anonymiseret data uden persondetaljer."}
          </FieldDescription>
        ) : null}
      </Field>

      <PermissionFields
        draft={draft}
        options={options}
        disabled={disabled}
        onChange={onChange}
      />

      <FieldSet>
        <FieldLegend variant="label">Lokationsadgang</FieldLegend>
        <FieldDescription>
          API-nøglen kan kun bruge data fra den valgte lokationspolitik.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="api-key-location-policy">Politik</FieldLabel>
          <Select
            value={draft.locationPolicy.kind}
            onValueChange={(value) => {
              if (value === "all") {
                onChange({ ...draft, locationPolicy: { kind: "all" } });
              } else if (value === "selected") {
                onChange({
                  ...draft,
                  locationPolicy: {
                    kind: "selected",
                    locationIds:
                      selectedLocations.length > 0
                        ? selectedLocations
                        : options.locations[0]
                          ? [options.locations[0].id]
                          : [],
                  },
                });
              } else if (value === "operator" && options.operators[0]) {
                onChange({
                  ...draft,
                  locationPolicy: {
                    kind: "operator",
                    operatorId: options.operators[0].id,
                  },
                });
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger id="api-key-location-policy" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Lokationspolitik</SelectLabel>
                <SelectItem
                  value="all"
                  disabled={!options.canGrantAllLocations}
                >
                  Alle lokationer
                </SelectItem>
                <SelectItem
                  value="selected"
                  disabled={options.locations.length === 0}
                >
                  Valgte lokationer
                </SelectItem>
                <SelectItem
                  value="operator"
                  disabled={options.operators.length === 0}
                >
                  Operatørens lokationer
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        {draft.locationPolicy.kind === "selected" ? (
          <FieldSet className="gap-2 rounded-lg border p-3">
            <FieldLegend variant="label" className="text-sm">
              Lokationer
            </FieldLegend>
            {options.locations.map((location) => {
              const id = `api-key-location-${location.id}`;
              return (
                <Field key={location.id} orientation="horizontal">
                  <Checkbox
                    id={id}
                    checked={selectedLocations.includes(location.id)}
                    disabled={disabled}
                    onCheckedChange={(checked) => {
                      const locations = new Set(selectedLocations);
                      if (checked === true) locations.add(location.id);
                      else locations.delete(location.id);
                      onChange({
                        ...draft,
                        locationPolicy: {
                          kind: "selected",
                          locationIds: [...locations],
                        },
                      });
                    }}
                  />
                  <FieldContent>
                    <FieldLabel htmlFor={id}>{location.name}</FieldLabel>
                  </FieldContent>
                </Field>
              );
            })}
          </FieldSet>
        ) : null}

        {draft.locationPolicy.kind === "operator" ? (
          <Field>
            <FieldLabel htmlFor="api-key-operator">Operatør</FieldLabel>
            <Select
              value={draft.locationPolicy.operatorId}
              onValueChange={(value) => {
                if (!value) return;
                const operator = options.operators.find(
                  (item) => item.id === value,
                );
                if (!operator) return;
                onChange({
                  ...draft,
                  locationPolicy: {
                    kind: "operator",
                    operatorId: operator.id,
                  },
                });
              }}
              disabled={disabled}
            >
              <SelectTrigger id="api-key-operator" className="w-full">
                <SelectValue placeholder="Vælg operatør" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Operatører</SelectLabel>
                  {options.operators.map((operator) => (
                    <SelectItem key={operator.id} value={operator.id}>
                      {operator.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
      </FieldSet>
    </FieldGroup>
  );
}

function SecretDialog({
  secret,
  onClose,
}: {
  secret: SecretDialog | null;
  onClose: () => void;
}) {
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);
  const copied = secret?.secret === copiedSecret;

  async function copy() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.secret);
      setCopiedSecret(secret.secret);
      toast.success("API-hemmeligheden er kopieret");
    } catch {
      toast.error(
        "API-hemmeligheden kunne ikke kopieres. Markér den, og kopiér den manuelt.",
      );
    }
  }

  return (
    <Dialog
      open={secret !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            API-nøgle {secret?.action === "roteret" ? "roteret" : "oprettet"}
          </DialogTitle>
          <DialogDescription>
            Hemmeligheden kan kun vises nu. Gem den i dit sikre system, før du
            lukker dette vindue. Den kan ikke vises igen.
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-api-key-secret">Hemmelig API-nøgle</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="new-api-key-secret"
                  value={secret.secret}
                  readOnly
                  autoComplete="off"
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copy()}
                  className="sm:min-w-28"
                >
                  {copied ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <ClipboardIcon data-icon="inline-start" />
                  )}
                  {copied ? "Kopieret" : "Kopiér"}
                </Button>
              </div>
            </Field>
            <Alert variant="destructive">
              <AlertTitle>Gem hemmeligheden nu</AlertTitle>
              <AlertDescription>
                Når du lukker vinduet, kan denne hemmelighed ikke hentes eller
                vises igen.
              </AlertDescription>
            </Alert>
          </FieldGroup>
        ) : null}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Jeg har gemt hemmeligheden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeyActions({
  keyRow,
  disabled,
  onEdit,
  onRotate,
  onRevoke,
}: {
  keyRow: ApiKey;
  disabled: boolean;
  onEdit: () => void;
  onRotate: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || keyRow.status !== "active"}
        onClick={onEdit}
      >
        <EditIcon data-icon="inline-start" />
        Redigér adgang
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled || keyRow.status !== "active"}
        onClick={onRotate}
      >
        <RotateCcwIcon data-icon="inline-start" />
        Rotér
      </Button>
      <Button
        variant="destructive"
        size="sm"
        disabled={disabled || keyRow.status !== "active"}
        onClick={onRevoke}
      >
        <Trash2Icon data-icon="inline-start" />
        Tilbagekald
      </Button>
    </div>
  );
}

export function ApiKeyManagement() {
  const allowed = usePermission("apiKeys.manage");
  const options = useQuery(
    api.apiKeys.getAdminOptions,
    allowed ? {} : "skip",
  ) as AdminOptions | undefined;
  const listKeys = useAction(api.apiKeys.list);
  const createKey = useAction(api.apiKeys.create);
  const rotateKey = useAction(api.apiKeys.rotate);
  const revokeKey = useAction(api.apiKeys.revoke);
  const updatePolicy = useMutation(api.apiKeys.updatePolicy);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<PolicyDraft | null>(null);
  const [createName, setCreateName] = useState("");
  const [createExpiry, setCreateExpiry] = useState(addDays(90));
  const [creating, setCreating] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKey | null>(null);
  const [editDraft, setEditDraft] = useState<PolicyDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [rotationKey, setRotationKey] = useState<ApiKey | null>(null);
  const [rotationExpiry, setRotationExpiry] = useState(addDays(90));
  const [rotating, setRotating] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [secret, setSecret] = useState<SecretDialog | null>(null);

  const loadKeys = useCallback(async () => {
    if (!allowed) return;
    setLoadingKeys(true);
    try {
      setKeys(await listKeys({}));
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "API-nøglerne kunne ikke indlæses. Prøv igen."),
      );
      setKeys([]);
    } finally {
      setLoadingKeys(false);
    }
  }, [allowed, listKeys]);

  useEffect(() => {
    if (!allowed) return;
    const timer = window.setTimeout(() => void loadKeys(), 0);
    return () => window.clearTimeout(timer);
  }, [allowed, loadKeys]);

  function openCreate() {
    if (!options) return;
    setCreateDraft(initialDraft(options));
    setCreateName("");
    setCreateExpiry(addDays(90));
    setCreateOpen(true);
  }

  function openEdit(keyRow: ApiKey) {
    setEditingKey(keyRow);
    setEditDraft(draftFromKey(keyRow));
  }

  function validateDraft(draft: PolicyDraft | null) {
    if (!draft || !draft.role) {
      toast.error("Vælg en rolle");
      return false;
    }
    if (!draft.permissions.length) {
      toast.error("Vælg mindst én tilladelse");
      return false;
    }
    if (
      draft.locationPolicy.kind === "selected" &&
      draft.locationPolicy.locationIds.length === 0
    ) {
      toast.error("Vælg mindst én lokation");
      return false;
    }
    if (draft.locationPolicy.kind === "operator" && !draft.locationPolicy.operatorId) {
      toast.error("Vælg en operatør");
      return false;
    }
    return true;
  }

  async function create() {
    if (!createDraft || !validateDraft(createDraft)) return;
    if (!createName.trim()) {
      toast.error("Angiv et navn til API-nøglen");
      return;
    }
    setCreating(true);
    try {
      const result = await createKey({
        name: createName.trim(),
        expiresAt: dateInputToExpiry(createExpiry),
        input: createDraft,
      });
      setCreateOpen(false);
      setCreateDraft(null);
      setSecret({ secret: result.secret, name: result.key.name, action: "oprettet" });
      await loadKeys();
      toast.success("API-nøglen er oprettet");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "API-nøglen kunne ikke opdateres. Prøv igen."));
    } finally {
      setCreating(false);
    }
  }

  async function saveEdit() {
    const draft = editDraft;
    if (!editingKey || !draft) return;
    if (!validateDraft(draft)) return;
    setSavingEdit(true);
    try {
      await updatePolicy({ apiKeyId: editingKey.id, input: draft });
      setEditingKey(null);
      setEditDraft(null);
      await loadKeys();
      toast.success("API-nøglens adgang er opdateret");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "API-nøglen kunne ikke opdateres. Prøv igen."));
    } finally {
      setSavingEdit(false);
    }
  }

  async function rotate() {
    if (!rotationKey) return;
    setRotating(true);
    try {
      const result = await rotateKey({
        apiKeyId: rotationKey.id,
        expiresAt: dateInputToExpiry(rotationExpiry),
      });
      setRotationKey(null);
      setSecret({ secret: result.secret, name: result.key.name, action: "roteret" });
      await loadKeys();
      toast.success("API-nøglen er roteret");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "API-nøglen kunne ikke opdateres. Prøv igen."));
    } finally {
      setRotating(false);
    }
  }

  async function revoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const result = await revokeKey({ apiKeyId: revokeTarget.id });
      setRevokeTarget(null);
      await loadKeys();
      if (!result.credentialDisabled) {
        toast.warning(
          "Adgangspolitikken er tilbagekaldt, men legitimationsoplysningen kunne ikke deaktiveres. Kontakt support.",
        );
      } else {
        toast.success("API-nøglen er tilbagekaldt");
      }
    } catch (error) {
      toast.error(getUserErrorMessage(error, "API-nøglen kunne ikke opdateres. Prøv igen."));
    } finally {
      setRevoking(false);
    }
  }

  if (!allowed) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere API-nøgler.
        </AlertDescription>
      </Alert>
    );
  }

  if (!options || keys === null) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>API-nøgler</CardTitle>
            <CardDescription>
              Opret og administrér sikre adgangsnøgler til organisationens REST API.
            </CardDescription>
          </div>
          <Button
            onClick={openCreate}
            disabled={
              loadingKeys ||
              !options.roles.length ||
              (!options.canGrantAllLocations && !options.locations.length)
            }
          >
            <PlusIcon data-icon="inline-start" />
            Ny API-nøgle
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loadingKeys ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Henter API-nøgler …
            </div>
          ) : null}
          {keys.length === 0 && !loadingKeys ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyRoundIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen API-nøgler endnu</EmptyTitle>
                <EmptyDescription>
                  Opret en API-nøgle, når et eksternt system skal have adgang.
                </EmptyDescription>
              </EmptyHeader>
              <Button onClick={openCreate}>
                <PlusIcon data-icon="inline-start" />
                Opret API-nøgle
              </Button>
            </Empty>
          ) : null}

          {keys.length > 0 ? (
            <>
              <div className="flex flex-col gap-3 md:hidden">
                {keys.map((keyRow) => (
                  <Card key={keyRow.id} className="border shadow-none">
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-1">
                          <CardTitle className="truncate text-base">
                            {keyRow.name}
                          </CardTitle>
                          <CardDescription className="font-mono">
                            {keyRow.start || keyRow.prefix}
                          </CardDescription>
                        </div>
                        <Badge variant={statusVariant(keyRow.status)}>
                          {statusLabel(keyRow.status)}
                        </Badge>
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <span className="text-muted-foreground">Rolle: </span>
                          {roleName(keyRow.role, options)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Udløber: </span>
                          {dateFormatter.format(keyRow.expiresAt)}
                        </div>
                        <div>
                          <span className="text-muted-foreground">Adgang: </span>
                          {keyRow.permissions.length} tilladelser
                        </div>
                        <div>
                          <span className="text-muted-foreground">Lokationer: </span>
                          {locationPolicyLabel(keyRow.locationPolicy, options)}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-muted-foreground">Senest brugt: </span>
                          {keyRow.lastUsedAt
                            ? dateTimeFormatter.format(keyRow.lastUsedAt)
                            : "Aldrig"}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <KeyActions
                        keyRow={keyRow}
                        disabled={loadingKeys}
                        onEdit={() => openEdit(keyRow)}
                        onRotate={() => {
                          setRotationKey(keyRow);
                          setRotationExpiry(addDays(90));
                        }}
                        onRevoke={() => setRevokeTarget(keyRow)}
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Navn</TableHead>
                      <TableHead>Nøglestart</TableHead>
                      <TableHead>Rolle</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Udløber</TableHead>
                      <TableHead>Senest brugt</TableHead>
                      <TableHead>Adgang</TableHead>
                      <TableHead className="text-right">Handlinger</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {keys.map((keyRow) => (
                      <TableRow key={keyRow.id}>
                        <TableCell className="font-medium">{keyRow.name}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {keyRow.start || keyRow.prefix}
                        </TableCell>
                        <TableCell>{roleName(keyRow.role, options)}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(keyRow.status)}>
                            {statusLabel(keyRow.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{dateFormatter.format(keyRow.expiresAt)}</TableCell>
                        <TableCell>
                          {keyRow.lastUsedAt
                            ? dateTimeFormatter.format(keyRow.lastUsedAt)
                            : "Aldrig"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span>{keyRow.permissions.length} tilladelser</span>
                            <span className="text-xs text-muted-foreground">
                              {locationPolicyLabel(keyRow.locationPolicy, options)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <KeyActions
                            keyRow={keyRow}
                            disabled={loadingKeys}
                            onEdit={() => openEdit(keyRow)}
                            onRotate={() => {
                              setRotationKey(keyRow);
                              setRotationExpiry(addDays(90));
                            }}
                            onRevoke={() => setRevokeTarget(keyRow)}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open && !creating) {
            setCreateOpen(false);
            setCreateDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Opret API-nøgle</DialogTitle>
            <DialogDescription>
              Giv et eksternt system den mindst mulige adgang, det har brug for.
            </DialogDescription>
          </DialogHeader>
          {createDraft ? (
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-api-key-name">Navn</FieldLabel>
                <Input
                  id="new-api-key-name"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="F.eks. Lagerintegration"
                  maxLength={100}
                  disabled={creating}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-api-key-expiry">Udløbsdato</FieldLabel>
                <Input
                  id="new-api-key-expiry"
                  type="date"
                  value={createExpiry}
                  min={addDays(1)}
                  max={addDays(364)}
                  onChange={(event) => setCreateExpiry(event.target.value)}
                  disabled={creating}
                />
                <FieldDescription>
                  Standard er 90 dage. Nøglen kan højst være gyldig i ét år.
                </FieldDescription>
              </Field>
              <PolicyFields
                draft={createDraft}
                options={options}
                disabled={creating}
                onChange={setCreateDraft}
              />
            </FieldGroup>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Annullér
            </Button>
            <Button type="button" onClick={() => void create()} disabled={creating}>
              {creating ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
              Opret og vis hemmelighed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editingKey !== null}
        onOpenChange={(open) => {
          if (!open && !savingEdit) {
            setEditingKey(null);
            setEditDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Redigér API-adgang</DialogTitle>
            <DialogDescription>
              Navn og udløbsdato ændres ikke her. Justér rolle, tilladelser og
              lokationspolitik for {editingKey?.name}.
            </DialogDescription>
          </DialogHeader>
          {editDraft ? (
            <PolicyFields
              draft={editDraft}
              options={options}
              disabled={savingEdit}
              onChange={setEditDraft}
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingKey(null)}
              disabled={savingEdit}
            >
              Annullér
            </Button>
            <Button type="button" onClick={() => void saveEdit()} disabled={savingEdit}>
              {savingEdit ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" />}
              Gem adgang
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rotationKey !== null}
        onOpenChange={(open) => {
          if (!open && !rotating) setRotationKey(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Rotér API-nøgle</DialogTitle>
            <DialogDescription>
              Der oprettes en ny hemmelighed med samme adgang. Den gamle nøgle
              forbliver aktiv, så du kan skifte systemet uden nedetid. Tilbagekald
              den gamle nøgle, når overgangen er gennemført.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="rotate-api-key-expiry">Ny udløbsdato</FieldLabel>
            <Input
              id="rotate-api-key-expiry"
              type="date"
              value={rotationExpiry}
                min={addDays(1)}
                max={addDays(364)}
              onChange={(event) => setRotationExpiry(event.target.value)}
              disabled={rotating}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRotationKey(null)}
              disabled={rotating}
            >
              Annullér
            </Button>
            <Button type="button" onClick={() => void rotate()} disabled={rotating}>
              {rotating ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
              Rotér og vis hemmelighed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={revokeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !revoking) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tilbagekald API-nøglen?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.name} mister adgang med det samme. Handlingen kan
              ikke fortrydes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                void revoke();
              }}
              disabled={revoking}
            >
              {revoking ? <Spinner data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
              Tilbagekald nøgle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
    </div>
  );
}
