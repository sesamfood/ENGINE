"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { MessageSquarePlusIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { compressImage } from "@/lib/compress-image";
import {
  accessibleFeedbackAreas,
  feedbackAreaForPath,
  feedbackTypes,
  type FeedbackAreaId,
  type FeedbackType,
} from "@/lib/feedback";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4_000;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function FeedbackForm({
  permissions,
  onDone,
}: {
  permissions: readonly string[];
  onDone: () => void;
}) {
  const pathname = usePathname();
  const fieldId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const areas = accessibleFeedbackAreas(permissions);
  const [area, setArea] = useState<FeedbackAreaId>(() =>
    feedbackAreaForPath(pathname, areas),
  );
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const preview = useMemo(
    () => (screenshot ? URL.createObjectURL(screenshot) : undefined),
    [screenshot],
  );
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const uploadUrl = useMutation(api.feedback.generateScreenshotUploadUrl);
  const submitFeedback = useMutation(api.feedback.submit);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function pickScreenshot(file: File | undefined) {
    if (!file) return;
    if (!IMAGE_TYPES.has(file.type)) {
      toast.error("Vælg et JPEG-, PNG-, WebP- eller AVIF-billede");
      return;
    }
    setScreenshot(file);
  }

  function removeScreenshot() {
    if (fileInput.current) fileInput.current.value = "";
    setScreenshot(null);
  }

  async function uploadScreenshot(file: File) {
    const compressed = await compressImage(file, {
      maxWidth: 2600,
      maxHeight: 2600,
      quality: 0.9,
    });
    if (compressed.size > MAX_FILE_SIZE) {
      throw new Error("Det komprimerede billede er stadig større end 10 MB");
    }
    const url = await uploadUrl({});
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": compressed.type },
      body: compressed,
    });
    if (!response.ok) throw new Error("Billedet kunne ikke uploades");
    const result: unknown = await response.json();
    if (
      !result ||
      typeof result !== "object" ||
      !("storageId" in result) ||
      typeof result.storageId !== "string"
    ) {
      throw new Error("Billedet kunne ikke uploades");
    }
    return result.storageId as Id<"_storage">;
  }

  async function send() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Skriv en titel");
      return;
    }
    const trimmed = description.trim();
    setError(undefined);
    setSubmitting(true);
    try {
      const screenshotStorageId = screenshot
        ? await uploadScreenshot(screenshot)
        : undefined;
      await submitFeedback({
        area,
        type,
        title: trimmedTitle,
        ...(trimmed ? { description: trimmed } : {}),
        ...(screenshotStorageId ? { screenshotStorageId } : {}),
      });
      toast.success("Tak. Din feedback er sendt");
      onDone();
    } catch (caught) {
      toast.error(getUserErrorMessage(caught, "Din feedback kunne ikke sendes. Prøv igen."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        id="feedback-form"
        className="min-h-0 overflow-y-auto p-1"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${fieldId}-area`}>
              Hvor i systemet?
            </FieldLabel>
            <Select
              items={areas.map((item) => ({
                value: item.id,
                label: item.label,
              }))}
              value={area}
              onValueChange={(value) => setArea(value as FeedbackAreaId)}
            >
              <SelectTrigger id={`${fieldId}-area`} className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {areas.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldTitle id={`${fieldId}-type-label`}>
              Hvad handler det om?
            </FieldTitle>
            <ToggleGroup
              value={[type]}
              variant="outline"
              spacing={0}
              aria-labelledby={`${fieldId}-type-label`}
              className="w-full"
              onValueChange={(value) => {
                const next = value[0];
                if (next === "bug" || next === "feature") setType(next);
              }}
            >
              {feedbackTypes.map((item) => (
                <ToggleGroupItem
                  key={item.id}
                  value={item.id}
                  className="h-11 flex-1"
                >
                  {item.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <FieldDescription>
              {type === "bug"
                ? "Noget virker ikke, som det skal."
                : "Et ønske til noget nyt eller bedre."}
            </FieldDescription>
          </Field>

          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={`${fieldId}-title`}>Titel</FieldLabel>
            <Input
              id={`${fieldId}-title`}
              className="min-h-11"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              placeholder={
                type === "bug"
                  ? "Kort overskrift på fejlen"
                  : "Kort overskrift på forslaget"
              }
              onChange={(event) => setTitle(event.target.value)}
            />
            <FieldError>{error}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor={`${fieldId}-description`}>
              Beskrivelse
            </FieldLabel>
            <FieldDescription>Valgfrit.</FieldDescription>
            <Textarea
              id={`${fieldId}-description`}
              value={description}
              rows={6}
              maxLength={MAX_DESCRIPTION_LENGTH}
              placeholder={
                type === "bug"
                  ? "Hvad gjorde du, og hvad skete der?"
                  : "Hvad ønsker du, og hvad skal det hjælpe med?"
              }
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor={`${fieldId}-screenshot`}>
              Skærmbillede
            </FieldLabel>
            <FieldDescription>
              Valgfrit, men gør det nemmere at forstå.
            </FieldDescription>
            {preview ? (
              <div
                role="img"
                aria-label="Forhåndsvisning af skærmbillede"
                className="aspect-video w-full rounded-lg border bg-muted bg-contain bg-center bg-no-repeat"
                style={{ backgroundImage: `url("${preview}")` }}
              />
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => fileInput.current?.click()}
              >
                <UploadIcon data-icon="inline-start" />
                {screenshot ? "Skift billede" : "Vælg billede"}
              </Button>
              {screenshot ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11"
                  onClick={removeScreenshot}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Fjern
                </Button>
              ) : null}
            </div>
            <Input
              ref={fileInput}
              id={`${fieldId}-screenshot`}
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={(event) => pickScreenshot(event.target.files?.[0])}
            />
          </Field>
        </FieldGroup>
      </form>

      <DialogFooter>
        <DialogClose
          render={
            <Button type="button" variant="outline" disabled={submitting} />
          }
        >
          Annullér
        </DialogClose>
        <Button type="submit" form="feedback-form" disabled={submitting}>
          {submitting ? <Spinner data-icon="inline-start" /> : null}
          Send feedback
        </Button>
      </DialogFooter>
    </>
  );
}

export function FeedbackDialog({
  permissions,
  compact = false,
}: {
  permissions: readonly string[] | undefined;
  compact?: boolean;
}) {
  const { isAuthenticated } = useConvexAuth();
  const enabled = useQuery(
    api.feedback.isEnabled,
    isAuthenticated && permissions ? {} : "skip",
  );
  const { setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false);

  if (!permissions || enabled !== true) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setOpenMobile(false);
      }}
    >
      <DialogTrigger
        render={
          compact ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Send feedback"
            />
          ) : (
            <SidebarMenuButton
              size="lg"
              aria-label="Send feedback"
              tooltip="Send feedback"
              className="group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0!"
            />
          )
        }
      >
        <MessageSquarePlusIcon aria-hidden="true" />
        {!compact ? (
          <span className="group-data-[collapsible=icon]:hidden">
            Send feedback
          </span>
        ) : null}
      </DialogTrigger>

      <DialogContent className="grid max-h-[calc(100vh-2rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Fortæl hvad der driller, eller hvad du savner. Vi læser det hele.
          </DialogDescription>
        </DialogHeader>
        <FeedbackForm permissions={permissions} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
