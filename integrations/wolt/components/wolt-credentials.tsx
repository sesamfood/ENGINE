"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { SaveIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

type WoltCredentialSettings = FunctionReturnType<
  typeof api.woltCredentials.getSettings
>;

export function WoltCredentials({
  settings,
}: {
  settings: WoltCredentialSettings;
}) {
  const access = useAccess();
  const save = useMutation(api.woltCredentials.save);
  const [environmentDraft, setEnvironmentDraft] = useState<
    WoltCredentialSettings["environment"] | null
  >(null);
  const [clientIdDraft, setClientIdDraft] = useState<string | null>(null);
  const [redirectUrisDraft, setRedirectUrisDraft] = useState<string | null>(
    null,
  );
  const [clientSecret, setClientSecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [wioApiKey, setWioApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);
  const environment = environmentDraft ?? settings.environment;
  const clientId = clientIdDraft ?? settings.clientId;
  const redirectUris = redirectUrisDraft ?? settings.wioRedirectUris.join("\n");
  const canManage = settings.canManage && access?.locationScope.all === true;
  const disabled = !canManage || saving;
  const clientLocked = settings.configured && settings.hasActiveConnections;

  async function saveCredentials() {
    if (disabled) return;
    if (
      !clientId.trim() ||
      (!settings.hasClientSecret && !clientSecret.trim()) ||
      (!settings.hasWebhookSecret && !webhookSecret.trim())
    ) {
      toast.error(
        "Udfyld klient-id, klienthemmelighed og webhook-hemmelighed.",
      );
      return;
    }
    const wioRedirectUris = redirectUris
      .split("\n")
      .map((uri) => uri.trim())
      .filter(Boolean);
    if (wioRedirectUris.length > 10) {
      setRedirectError("Angiv højst 10 returadresser.");
      return;
    }
    for (const uri of wioRedirectUris) {
      try {
        const url = new URL(uri);
        const local =
          url.hostname === "localhost" || url.hostname === "127.0.0.1";
        if (
          (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
          url.username ||
          url.password ||
          url.hash
        ) {
          throw new Error("Invalid redirect URI");
        }
      } catch {
        setRedirectError(
          "Angiv gyldige HTTPS-adresser uden loginoplysninger eller fragment. HTTP er kun tilladt på localhost og 127.0.0.1.",
        );
        return;
      }
    }
    if (
      (wioApiKey.trim() || settings.hasWioApiKey) &&
      wioRedirectUris.length === 0
    ) {
      setRedirectError(
        "Angiv mindst én returadresse, når der er gemt en WIO API-nøgle.",
      );
      return;
    }
    setRedirectError(null);
    setSaving(true);
    try {
      await save({
        environment,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim() || undefined,
        webhookSecret: webhookSecret.trim() || undefined,
        wioApiKey: wioApiKey.trim() || undefined,
        wioRedirectUris,
      });
      setClientSecret("");
      setWebhookSecret("");
      setWioApiKey("");
      setEnvironmentDraft(null);
      setClientIdDraft(null);
      setRedirectUrisDraft(null);
      toast.success("Organisationens Wolt-nøgler er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Wolt-nøglerne kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Organisationens Wolt-nøgler</CardTitle>
        <CardDescription>
          Gem organisationens egne Wolt-nøgler, før du forbinder lokationer.
        </CardDescription>
      </CardHeader>
      <CardContent appearance="relaxed" className="flex flex-col">
        {!canManage ? (
          <Alert>
            <AlertTitle>
              Wolt-nøgler kræver adgang til alle lokationer
            </AlertTitle>
            <AlertDescription>
              Kontakt en Administrator for at gemme eller ændre organisationens
              Wolt-nøgler.
            </AlertDescription>
          </Alert>
        ) : null}
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void saveCredentials();
          }}
        >
          <FieldGroup className="grid md:grid-cols-2">
            <Field data-disabled={disabled || clientLocked}>
              <div className="flex items-center gap-1">
                <FieldLabel id="wolt-environment-label">Wolt-miljø</FieldLabel>
                <HelpTooltip
                  label="Wolt-miljø"
                  content={
                    clientLocked
                      ? "Afbryd alle Wolt-forbindelser nedenfor, før du ændrer miljø eller klient-id. Lokationerne skal derefter forbindes igen."
                      : "Brug Produktion til rigtige ordrer og Test til Wolts testmiljø. Nøglerne skal høre til det valgte miljø."
                  }
                />
              </div>
              <ToggleGroup
                aria-labelledby="wolt-environment-label"
                variant="outline"
                size="lg"
                value={[environment]}
                disabled={disabled || clientLocked}
                onValueChange={(values) => {
                  const value = values[0];
                  if (value === "production" || value === "development")
                    setEnvironmentDraft(value);
                }}
              >
                <ToggleGroupItem value="production">Produktion</ToggleGroupItem>
                <ToggleGroupItem value="development">Test</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <Field data-disabled={disabled || clientLocked}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="wolt-client-id">Klient-id</FieldLabel>
                <HelpTooltip
                  label="Wolt-klient-id"
                  content={
                    clientLocked
                      ? "Afbryd alle Wolt-forbindelser nedenfor, før du ændrer klient-id. Lokationerne skal derefter forbindes igen."
                      : "Brug organisationens OAuth-klient-id fra Wolt."
                  }
                />
              </div>
              <Input
                id="wolt-client-id"
                value={clientId}
                onChange={(event) => setClientIdDraft(event.target.value)}
                required
                maxLength={200}
                autoComplete="off"
                disabled={disabled || clientLocked}
                className="h-11"
              />
            </Field>
            <Field data-disabled={disabled}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="wolt-client-secret">
                  Klienthemmelighed
                </FieldLabel>
                <HelpTooltip
                  label="Wolt-klienthemmelighed"
                  content="Brug organisationens OAuth client secret fra Wolt. Den gemte nøgle vises ikke igen. Lad feltet være tomt for at beholde den."
                />
              </div>
              <Input
                id="wolt-client-secret"
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                required={!settings.hasClientSecret}
                maxLength={8000}
                autoComplete="new-password"
                placeholder={
                  settings.hasClientSecret
                    ? "Gemt. Indtast kun ved ændring"
                    : "Klienthemmelighed fra Wolt"
                }
                disabled={disabled}
                className="h-11"
              />
            </Field>
            <Field data-disabled={disabled}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="wolt-webhook-secret">
                  Webhook-hemmelighed
                </FieldLabel>
                <HelpTooltip
                  label="Wolt-webhook-hemmelighed"
                  content="Brug den hemmelighed, Wolt bruger til at signere organisationens webhooks. Den gemte nøgle vises ikke igen. Lad feltet være tomt for at beholde den."
                />
              </div>
              <Input
                id="wolt-webhook-secret"
                type="password"
                value={webhookSecret}
                onChange={(event) => setWebhookSecret(event.target.value)}
                required={!settings.hasWebhookSecret}
                maxLength={8000}
                autoComplete="new-password"
                placeholder={
                  settings.hasWebhookSecret
                    ? "Gemt. Indtast kun ved ændring"
                    : "Webhook-hemmelighed fra Wolt"
                }
                disabled={disabled}
                className="h-11"
              />
            </Field>
            <Field data-disabled={disabled}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="wolt-wio-api-key">
                  WIO API-nøgle
                </FieldLabel>
                <HelpTooltip
                  label="WIO API-nøgle"
                  content="Valgfri. Bruges kun, hvis Wolt opretter forbindelserne med WIO. Lad feltet være tomt for at beholde en gemt nøgle."
                />
              </div>
              <Input
                id="wolt-wio-api-key"
                type="password"
                value={wioApiKey}
                onChange={(event) => setWioApiKey(event.target.value)}
                maxLength={8000}
                autoComplete="new-password"
                placeholder={
                  settings.hasWioApiKey
                    ? "Gemt. Indtast kun ved ændring"
                    : "Valgfri API-nøgle fra Wolt"
                }
                disabled={disabled}
                className="h-11"
              />
            </Field>
            <Field
              data-disabled={disabled}
              data-invalid={Boolean(redirectError)}
            >
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="wolt-wio-redirect-uris">
                  Tilladte WIO-returadresser
                </FieldLabel>
                <HelpTooltip
                  label="WIO-returadresser"
                  content="Indsæt de præcise redirect-URL'er, der er registreret hos Wolt til WIO. Én adresse pr. linje, højst 10. Kræves kun ved WIO."
                />
              </div>
              <Textarea
                id="wolt-wio-redirect-uris"
                value={redirectUris}
                onChange={(event) => {
                  setRedirectUrisDraft(event.target.value);
                  setRedirectError(null);
                }}
                autoComplete="off"
                rows={3}
                maxLength={20490}
                disabled={disabled}
                aria-invalid={Boolean(redirectError)}
                aria-describedby={
                  redirectError ? "wolt-wio-redirect-error" : undefined
                }
              />
              {redirectError ? (
                <FieldError id="wolt-wio-redirect-error">
                  {redirectError}
                </FieldError>
              ) : null}
            </Field>
          </FieldGroup>
          {canManage ? (
            <div>
              <Button type="submit" size="lg" disabled={saving}>
                {saving ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <SaveIcon data-icon="inline-start" />
                )}
                Gem Wolt-nøgler
              </Button>
            </div>
          ) : null}
        </form>
        <FieldGroup>
          {[
            {
              id: "oauth",
              label: "OAuth-returadresse",
              value: settings.oauthRedirectUri,
              help: "Registrér denne adresse som redirect URI for organisationens OAuth-klient hos Wolt.",
            },
            {
              id: "webhook",
              label: "Webhook-adresse",
              value: settings.webhookUrl,
              help: "Registrér denne adresse hos Wolt til organisationens ordre-webhooks.",
            },
            {
              id: "wio",
              label: "WIO-opsætningsadresse",
              value: settings.wioOnboardingUrl,
              help: "Brug denne adresse hos Wolt, hvis organisationen bruger WIO til at oprette forbindelser.",
            },
          ].map((callback) => (
            <Field key={callback.id}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor={`wolt-callback-${callback.id}`}>
                  {callback.label}
                </FieldLabel>
                <HelpTooltip label={callback.label} content={callback.help} />
              </div>
              <Input
                id={`wolt-callback-${callback.id}`}
                value={callback.value}
                readOnly
                autoComplete="off"
                className="h-11"
                onFocus={(event) => event.currentTarget.select()}
              />
            </Field>
          ))}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
