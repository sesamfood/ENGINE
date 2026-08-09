"use client";

import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { ImageIcon, Trash2Icon, UploadIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";
import { compressImage } from "@/lib/compress-image";
import { cn } from "@/lib/utils";
import { OrganizationThemeCard } from "./organization-theme-card";

const MAX_LOGO_SIZE = 2 * 1024 * 1024;
const MAX_LOGO_SOURCE_SIZE = 10 * 1024 * 1024;
const LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Logoet kunne ikke opdateres. Prøv igen.";
}

function LogoUploadCard({
  name,
  title,
  guidance,
  currentUrl,
  organizationName,
  wide = false,
  onUpload,
  onRemove,
}: {
  name: string;
  title: string;
  guidance: string;
  currentUrl?: string;
  organizationName: string;
  wide?: boolean;
  onUpload: (storageId: Id<"_storage">) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const generateUploadUrl = useMutation(api.organization.generateLogoUploadUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [imageDimensions, setImageDimensions] = useState<{
    url: string;
    aspectRatio: number;
  }>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function clearFile() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = undefined;
    setPreviewUrl(undefined);
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function selectFile(nextFile: File | null) {
    clearFile();
    setError(undefined);
    if (!nextFile) return;

    previewUrlRef.current = URL.createObjectURL(nextFile);
    setPreviewUrl(previewUrlRef.current);
    setFile(nextFile);

    if (!LOGO_TYPES.includes(nextFile.type)) {
      setError("Brug et logo i JPEG-, PNG- eller WebP-format");
      return;
    }
    if (nextFile.size > MAX_LOGO_SOURCE_SIZE) {
      setError("Logoet må højst være 10 MB før komprimering");
    }
  }

  async function uploadLogo() {
    if (!file || error) return;
    setSaving(true);
    setError(undefined);

    try {
      const image = await compressImage(file, {
        maxWidth: wide ? 600 : 256,
        maxHeight: wide ? 200 : 256,
      });
      if (image.size > MAX_LOGO_SIZE) {
        throw new Error("Logoet kunne ikke komprimeres til under 2 MB");
      }
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": image.type },
        body: image,
      });
      if (!response.ok) throw new Error("Logoet kunne ikke uploades");

      const upload = (await response.json()) as { storageId?: string };
      if (!upload.storageId)
        throw new Error("Uploaden returnerede ikke en fil");

      await onUpload(upload.storageId as Id<"_storage">);
      clearFile();
      toast.success(`${title} er opdateret`);
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setSaving(false);
    }
  }

  async function deleteLogo() {
    setSaving(true);
    setError(undefined);

    try {
      await onRemove();
      clearFile();
      toast.success(`${title} er fjernet`);
    } catch (removeError) {
      setError(getErrorMessage(removeError));
    } finally {
      setSaving(false);
    }
  }

  const shownLogo = previewUrl ?? currentUrl;
  const inputId = `organization-${name}-logo`;
  const imageAspectRatio =
    imageDimensions && imageDimensions.url === shownLogo
      ? imageDimensions.aspectRatio
      : undefined;

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent
        className={cn(
          "grid gap-6",
          wide
            ? "lg:grid-cols-[minmax(0,24rem)_1fr]"
            : "sm:grid-cols-[8rem_1fr]",
        )}
      >
        <Button
          type="button"
          variant="outline"
          aria-label={`Vælg fil til ${title.toLocaleLowerCase("da")}`}
          disabled={saving}
          onClick={() => inputRef.current?.click()}
          style={
            wide ? { aspectRatio: imageAspectRatio ?? 4 } : undefined
          }
          className={cn(
            "relative overflow-hidden p-0",
            wide ? "h-auto w-full max-w-96 self-center" : "size-32",
          )}
        >
          {shownLogo ? (
            <Image
              src={shownLogo}
              alt={`${organizationName} ${title.toLocaleLowerCase("da")}`}
              fill
              className={wide ? "object-contain" : "object-cover"}
              onLoad={(event) => {
                if (wide) {
                  setImageDimensions({
                    url: shownLogo,
                    aspectRatio:
                      event.currentTarget.naturalWidth /
                      event.currentTarget.naturalHeight,
                  });
                }
              }}
            />
          ) : (
            <div className="grid size-full place-items-center text-muted-foreground">
              <ImageIcon className="size-9" aria-hidden="true" />
            </div>
          )}
        </Button>

        <Field data-invalid={Boolean(error)}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor={inputId}>Vælg billedfil</FieldLabel>
            <HelpTooltip label="Vælg billedfil" content={guidance} />
          </div>
          <Input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={LOGO_TYPES.join(",")}
            className="sr-only"
            disabled={saving}
            aria-invalid={Boolean(error)}
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          />
          <div className="flex min-h-11 flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={saving}
              onClick={() => inputRef.current?.click()}
            >
              <UploadIcon data-icon="inline-start" />
              Vælg fil
            </Button>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {file?.name ?? "Ingen fil valgt"}
            </span>
          </div>
          <FieldError>{error}</FieldError>
        </Field>
      </CardContent>
      <CardFooter className="flex-col-reverse items-stretch gap-3 sm:flex-row sm:justify-between">
        {currentUrl ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button type="button" variant="outline" disabled={saving} />
              }
            >
              <Trash2Icon data-icon="inline-start" />
              Fjern logo
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Fjern {title.toLocaleLowerCase("da")}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Navigationen bruger standardvisningen, indtil et nyt logo
                  bliver tilføjet.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Behold logo</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={deleteLogo}>
                  Fjern logo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <span />
        )}

        <Button
          type="button"
          size="lg"
          disabled={!file || Boolean(error) || saving}
          onClick={uploadLogo}
        >
          {saving ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <UploadIcon data-icon="inline-start" />
          )}
          Gem logo
        </Button>
      </CardFooter>
    </Card>
  );
}

export function OrganizationAppearance() {
  const organization = authClient.useActiveOrganization();
  const membership = authClient.useActiveMemberRole();
  const branding = useQuery(api.organization.getBranding);
  const setLogo = useMutation(api.organization.setLogo);
  const removeLogo = useMutation(api.organization.removeLogo);
  const setWideLogo = useMutation(api.organization.setWideLogo);
  const removeWideLogo = useMutation(api.organization.removeWideLogo);

  if (
    organization.isPending ||
    membership.isPending ||
    branding === undefined
  ) {
    return (
      <div className="flex max-w-4xl flex-col gap-6">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!organization.data || !canManageOrganization(membership.data?.role)) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun administratorer kan ændre organisationens oplysninger.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-2xl font-semibold tracking-tight">Visuel identitet</h2>

      <div className="flex flex-col gap-6">
        <OrganizationThemeCard currentTheme={branding.theme} />

        <LogoUploadCard
          name="app-icon"
          title="Appikon"
          guidance="JPEG, PNG eller WebP. Højst 2 MB. Brug helst et billede i formatet 1:1; billedet fylder hele rammen."
          currentUrl={organization.data.logo ?? undefined}
          organizationName={organization.data.name}
          onUpload={async (storageId) => {
            await setLogo({ storageId });
            await organization.refetch();
          }}
          onRemove={async () => {
            await removeLogo({});
            await organization.refetch();
          }}
        />

        <LogoUploadCard
          name="navigation"
          title="Navigationslogo"
          guidance="JPEG, PNG eller WebP. Højst 2 MB. Et bredt format omkring 4:1 med gennemsigtig baggrund fungerer bedst."
          currentUrl={branding.wideLogoUrl ?? undefined}
          organizationName={organization.data.name}
          wide
          onUpload={async (storageId) => {
            await setWideLogo({ storageId });
          }}
          onRemove={async () => {
            await removeWideLogo({});
          }}
        />
      </div>
    </div>
  );
}
