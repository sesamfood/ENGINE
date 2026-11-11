"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { SettingsSwitchField } from "./settings-switch-field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormCardSkeleton } from "@/components/page-skeletons";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { feedbackAreaLabel, feedbackTypeLabel } from "@/lib/feedback";
import { usePermission } from "@/components/app-shell";

type Destination = "linear" | "notion" | "email";
type Team = { id: string; key: string; name: string };
type NotionProject = { property: string; name: string; pageId?: string };
type NotionDatabase = { id: string; name: string; projects: NotionProject[] };

const NO_COLUMN = "none";
const valueKey = (project: NotionProject) => project.pageId ?? project.name;

const destinationDescriptions = {
  email: "Feedback sendes som e-mail med skærmbilledet vedhæftet.",
  linear: "Feedback oprettes som en sag i Linear med et link til skærmbilledet.",
  notion: "Feedback oprettes som en side i en Notion-database med skærmbilledet.",
} as const;

const destinationLabels = { linear: "Linear", notion: "Notion" } as const;

const submittedAtFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

export function FeedbackSettings() {
  const canManage = usePermission("organization.settings");
  const settings = useQuery(
    api.feedback.getSettings,
    canManage ? {} : "skip",
  );
  const save = useMutation(api.feedback.saveSettings);
  const listTeams = useAction(api.feedback.listLinearTeams);
  const listDatabases = useAction(api.feedback.listNotionDatabases);

  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<Destination | null>(
    null,
  );
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamDraft, setTeamDraft] = useState<string | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [notionToken, setNotionToken] = useState("");
  const [databases, setDatabases] = useState<NotionDatabase[] | null>(null);
  const [databaseDraft, setDatabaseDraft] = useState<string | null>(null);
  const [columnDraft, setColumnDraft] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<string | null>(null);
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til feedbackindstillingerne.
        </AlertDescription>
      </Alert>
    );
  }

  if (settings === undefined) {
    return <FormCardSkeleton fields={5} />;
  }

  const enabled = enabledDraft ?? settings.enabled;
  const destination = destinationDraft ?? settings.destination;
  const email = emailDraft ?? settings.email ?? "";
  const teamId = teamDraft ?? settings.linearTeamId ?? "";
  const teamName =
    teams?.find((team) => team.id === teamId)?.name ??
    settings.linearTeamName ??
    "";
  const teamOptions = teams
    ? teams.map((team) => ({
        value: team.id,
        label: team.key ? `${team.name} (${team.key})` : team.name,
      }))
    : settings.linearTeamId
      ? [
          {
            value: settings.linearTeamId,
            label: settings.linearTeamName ?? settings.linearTeamId,
          },
        ]
      : [];

  const databaseId = databaseDraft ?? settings.notionDatabaseId ?? "";
  const databaseName =
    databases?.find((database) => database.id === databaseId)?.name ??
    settings.notionDatabaseName ??
    "";
  const databaseOptions = databases
    ? databases.map((database) => ({
        value: database.id,
        label: database.name,
      }))
    : settings.notionDatabaseId
      ? [
          {
            value: settings.notionDatabaseId,
            label: settings.notionDatabaseName ?? settings.notionDatabaseId,
          },
        ]
      : [];

  const savedProjects = settings.notionProject ? [settings.notionProject] : [];
  const projects =
    databases?.find((database) => database.id === databaseId)?.projects ??
    (databaseId === settings.notionDatabaseId ? savedProjects : []);
  const columnOptions = [
    { value: NO_COLUMN, label: "Ingen kolonne" },
    ...[...new Set(projects.map((project) => project.property))].map(
      (property) => ({ value: property, label: property }),
    ),
  ];
  const column =
    columnDraft ?? settings.notionProject?.property ?? NO_COLUMN;
  const valueOptions = projects
    .filter((project) => project.property === column)
    .map((project) => ({ value: valueKey(project), label: project.name }));
  const projectValue =
    projectDraft ??
    (settings.notionProject ? valueKey(settings.notionProject) : "");
  const selectedProject =
    projects.find(
      (project) =>
        project.property === column && valueKey(project) === projectValue,
    ) ?? null;

  async function loadDatabases() {
    setLoadingDatabases(true);
    try {
      const result = await listDatabases(
        notionToken.trim() ? { token: notionToken.trim() } : {},
      );
      setDatabases(result);
      if (result.length === 0) {
        toast.error(
          "Der blev ikke fundet nogen databaser. Del en database med integrationen i Notion",
        );
      } else {
        toast.success(`${result.length} databaser blev hentet fra Notion`);
      }
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Feedbackindstillingerne kunne ikke opdateres. Prøv igen."));
    } finally {
      setLoadingDatabases(false);
    }
  }

  async function loadTeams() {
    setLoadingTeams(true);
    try {
      const result = await listTeams(apiKey.trim() ? { apiKey: apiKey.trim() } : {});
      setTeams(result);
      if (result.length === 0) {
        toast.error("Der blev ikke fundet nogen teams i Linear");
      } else {
        toast.success(`${result.length} teams blev hentet fra Linear`);
      }
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Feedbackindstillingerne kunne ikke opdateres. Prøv igen."));
    } finally {
      setLoadingTeams(false);
    }
  }

  async function persist() {
    setSaving(true);
    try {
      await save({
        enabled,
        destination,
        email: email.trim(),
        ...(apiKey.trim() ? { linearApiKey: apiKey.trim() } : {}),
        ...(teamId ? { linearTeamId: teamId } : {}),
        ...(teamName ? { linearTeamName: teamName } : {}),
        ...(notionToken.trim() ? { notionToken: notionToken.trim() } : {}),
        ...(databaseId ? { notionDatabaseId: databaseId } : {}),
        ...(databaseName ? { notionDatabaseName: databaseName } : {}),
        notionProject: selectedProject,
      });
      setApiKey("");
      setNotionToken("");
      setDatabaseDraft(null);
      setColumnDraft(null);
      setProjectDraft(null);
      setEnabledDraft(null);
      setDestinationDraft(null);
      setEmailDraft(null);
      setTeamDraft(null);
      toast.success("Feedbackindstillingerne blev gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Feedbackindstillingerne kunne ikke opdateres. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-10">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Feedback</CardTitle>
          <CardDescription>
            Slå feedback til, så alle brugere kan sende fejl og forslag via knappen
            i sidemenuen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <SettingsSwitchField
              id="feedback-enabled"
              label="Tillad feedback"
              checked={enabled}
              onCheckedChange={setEnabledDraft}
              help={{
                label: "Tillad feedback",
                content: "Slår knappen “Giv feedback” til for hele organisationen.",
              }}
            />

            <Field>
              <FieldTitle id="feedback-destination-label">Modtager</FieldTitle>
              <ToggleGroup
                value={[destination]}
                variant="outline"
                spacing={0}
                aria-labelledby="feedback-destination-label"
                className="w-full max-w-md"
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === "linear" || next === "notion" || next === "email") {
                    setDestinationDraft(next);
                  }
                }}
              >
                <ToggleGroupItem value="email" className="h-11 flex-1">
                  E-mail
                </ToggleGroupItem>
                <ToggleGroupItem value="linear" className="h-11 flex-1">
                  Linear
                </ToggleGroupItem>
                <ToggleGroupItem value="notion" className="h-11 flex-1">
                  Notion
                </ToggleGroupItem>
              </ToggleGroup>
              <FieldDescription>
                {destinationDescriptions[destination]}
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="feedback-email">
                E-mailadresse
                <HelpTooltip
                  label="e-mailadresse"
                  content={
                    destination === "email"
                      ? "Al feedback fra organisationen sendes til denne adresse."
                      : `Feedback sendes også til denne adresse, når den oprettes i ${destinationLabels[destination]}.`
                  }
                />
              </FieldLabel>
              <Input
                id="feedback-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                className="max-w-md"
                placeholder="feedback@eksempel.dk"
                value={email}
                onChange={(event) => setEmailDraft(event.target.value)}
              />
              <FieldDescription>
                {destination === "email"
                  ? "Al feedback fra organisationen sendes til denne adresse."
                  : `Send også feedbacken til denne adresse, når den oprettes i ${destinationLabels[destination]}.`}
              </FieldDescription>
            </Field>

            {destination === "linear" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="feedback-linear-key">
                    Linear API-nøgle
                    <HelpTooltip
                      label="Linear API-nøgle"
                      content="Opret en personlig API-nøgle under Settings → Security & access i Linear. Nøglen vises kun én gang."
                    />
                  </FieldLabel>
                  <Input
                    id="feedback-linear-key"
                    type="password"
                    autoComplete="off"
                    className="max-w-md"
                    placeholder={
                      settings.linearKeyConfigured
                        ? "Nøglen er gemt. Indtast en ny for at skifte"
                        : "lin_api_…"
                    }
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="feedback-linear-team">Team</FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      items={teamOptions}
                      value={teamId}
                      disabled={!teams}
                      onValueChange={setTeamDraft}
                    >
                      <SelectTrigger
                        id="feedback-linear-team"
                        className="min-h-11 w-full max-w-md"
                      >
                        <SelectValue placeholder="Hent teams for at vælge" />
                      </SelectTrigger>
                      <SelectContent>
                        {teamOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        loadingTeams ||
                        (!apiKey.trim() && !settings.linearKeyConfigured)
                      }
                      onClick={() => void loadTeams()}
                    >
                      {loadingTeams ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <RefreshCwIcon data-icon="inline-start" />
                      )}
                      Hent teams
                    </Button>
                  </div>
                  {!teams ? (
                    <FieldDescription>
                      Hent teams for at skifte team.
                    </FieldDescription>
                  ) : null}
                </Field>
              </>
            ) : null}

            {destination === "notion" ? (
              <>
                <Field>
                  <FieldLabel htmlFor="feedback-notion-token">
                    Notion-nøgle
                    <HelpTooltip
                      label="Notion-nøgle"
                      content="Opret en intern integration under Settings → Connections → Develop or manage integrations i Notion, og kopiér dens Internal Integration Secret. Del derefter databasen med integrationen via ••• → Connections."
                    />
                  </FieldLabel>
                  <Input
                    id="feedback-notion-token"
                    type="password"
                    autoComplete="off"
                    className="max-w-md"
                    placeholder={
                      settings.notionTokenConfigured
                        ? "Nøglen er gemt. Indtast en ny for at skifte"
                        : "ntn_…"
                    }
                    value={notionToken}
                    onChange={(event) => setNotionToken(event.target.value)}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="feedback-notion-database">
                    Database
                  </FieldLabel>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      items={databaseOptions}
                      value={databaseId}
                      disabled={!databases}
                      onValueChange={(value) => {
                        setDatabaseDraft(value);
                        setColumnDraft(NO_COLUMN);
                      }}
                    >
                      <SelectTrigger
                        id="feedback-notion-database"
                        className="min-h-11 w-full max-w-md"
                      >
                        <SelectValue placeholder="Hent databaser for at vælge" />
                      </SelectTrigger>
                      <SelectContent>
                        {databaseOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      disabled={
                        loadingDatabases ||
                        (!notionToken.trim() && !settings.notionTokenConfigured)
                      }
                      onClick={() => void loadDatabases()}
                    >
                      {loadingDatabases ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <RefreshCwIcon data-icon="inline-start" />
                      )}
                      Hent databaser
                    </Button>
                  </div>
                  {!databases ? (
                    <FieldDescription>
                      Hent databaser for at skifte database.
                    </FieldDescription>
                  ) : null}
                </Field>

                <Field>
                  <FieldLabel htmlFor="feedback-notion-column">
                    Kolonne
                    <HelpTooltip
                      label="Kolonne"
                      content="Vælg en select- eller relationskolonne i databasen og den værdi, feedback skal oprettes med. En relateret database skal også deles med integrationen."
                    />
                  </FieldLabel>
                  <Select
                    items={columnOptions}
                    value={column}
                    disabled={!databases || projects.length === 0}
                    onValueChange={(value) => {
                      const next = value ?? NO_COLUMN;
                      setColumnDraft(next);
                      const first = projects.find(
                        (project) => project.property === next,
                      );
                      setProjectDraft(first ? valueKey(first) : "");
                    }}
                  >
                    <SelectTrigger
                      id="feedback-notion-column"
                      className="min-h-11 w-full max-w-md"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {columnOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {databases && databaseId && projects.length === 0 ? (
                    <FieldDescription>
                      Databasen har ingen select- eller relationskolonner med værdier.
                    </FieldDescription>
                  ) : null}
                </Field>

                {column !== NO_COLUMN ? (
                  <Field>
                    <FieldLabel htmlFor="feedback-notion-value">Værdi</FieldLabel>
                    <Select
                      items={valueOptions}
                      value={selectedProject ? valueKey(selectedProject) : null}
                      disabled={!databases}
                      onValueChange={(value) => setProjectDraft(value ?? "")}
                    >
                      <SelectTrigger
                        id="feedback-notion-value"
                        className="min-h-11 w-full max-w-md"
                      >
                        <SelectValue placeholder="Vælg værdi" />
                      </SelectTrigger>
                      <SelectContent>
                        {valueOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : null}
              </>
            ) : null}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button
            type="button"
            className="min-h-11"
            disabled={saving}
            onClick={() => void persist()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Gem
          </Button>
        </CardFooter>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Seneste feedback</CardTitle>
          <CardDescription>
            Viser om den indsendte feedback nåede frem til modtageren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {settings.recent.length === 0 ? (
            <Empty appearance="borderless">
              <EmptyHeader>
                <EmptyTitle>Ingen feedback endnu</EmptyTitle>
                <EmptyDescription>
                  Indsendt feedback vises her, så du kan se, om den blev leveret.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tidspunkt</TableHead>
                  <TableHead>Bruger</TableHead>
                  <TableHead>Område</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.recent.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="whitespace-nowrap">
                      {submittedAtFormatter.format(submission.createdAt)}
                    </TableCell>
                    <TableCell>{submission.userName}</TableCell>
                    <TableCell>{feedbackAreaLabel(submission.area)}</TableCell>
                    <TableCell>{feedbackTypeLabel(submission.type)}</TableCell>
                    <TableCell>
                      {submission.status === "sent" ? (
                        <Badge variant="secondary">Sendt</Badge>
                      ) : submission.status === "failed" ? (
                        <div className="flex flex-col gap-1">
                          <Badge variant="destructive">Fejlede</Badge>
                          {submission.failureMessage ? (
                            <span className="text-xs text-muted-foreground">
                              {submission.failureMessage}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="outline">Sender…</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
