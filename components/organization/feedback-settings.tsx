"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useAction, useMutation, useQuery } from "convex/react";
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
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { feedbackAreaLabel, feedbackTypeLabel } from "@/lib/feedback";
import { usePermission } from "@/components/app-shell";

type Destination = "linear" | "email";
type Team = { id: string; key: string; name: string };

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

  const [enabledDraft, setEnabledDraft] = useState<boolean | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<Destination | null>(
    null,
  );
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [teamDraft, setTeamDraft] = useState<string | null>(null);
  const [loadingTeams, setLoadingTeams] = useState(false);
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
    return <Skeleton className="h-96 w-full" />;
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
      });
      setApiKey("");
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
            <FieldLabel htmlFor="feedback-enabled">
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldTitle>Tillad feedback</FieldTitle>
                  <FieldDescription>
                    Slår knappen “Send feedback” til for hele organisationen.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="feedback-enabled"
                  checked={enabled}
                  onCheckedChange={setEnabledDraft}
                />
              </Field>
            </FieldLabel>

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
                  if (next === "linear" || next === "email") {
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
              </ToggleGroup>
              <FieldDescription>
                {destination === "email"
                  ? "Feedback sendes som e-mail med skærmbilledet vedhæftet."
                  : "Feedback oprettes som en sag i Linear med et link til skærmbilledet."}
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
                      : "Feedback sendes også til denne adresse, når den oprettes i Linear."
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
                  : "Send også feedbacken til denne adresse, når den oprettes i Linear."}
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
            <Empty className="border-0">
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
