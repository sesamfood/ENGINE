"use client";

import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { PencilIcon, PlayCircleIcon, PlusIcon, SprayCanIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useKiosk, usePermission } from "@/components/app-shell";
import { ProductCategoryCombobox } from "@/components/catalog/product-category-combobox";
import { CardGridSkeleton } from "@/components/page-skeletons";
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
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCompleteCatalog } from "@/hooks/use-complete-catalog";
import { compressCleaningVideo, MAX_CLEANING_VIDEO_BYTES } from "@/lib/food-safety-cleaning";
import { uploadToStorage } from "@/lib/upload-to-storage";
import { getUserErrorMessage } from "@/lib/user-errors";

type Task = FunctionReturnType<typeof api.foodSafetyCleaning.list>[number];
type EditorMode = Task | "new" | null;

export function CleaningTasks() {
  const tasks = useQuery(api.foodSafetyCleaning.list, {});
  const kiosk = useKiosk();
  const canManage = usePermission("foodSafety.manage") && !kiosk?.kioskModeEnabled;
  // Dialogs keep their last task while they animate closed.
  const [selected, setSelected] = useState<Task | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editor, setEditor] = useState<EditorMode>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const shown = tasks?.find((task) => task.id === selected?.id) ?? selected;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Cleaning</h2>
        {canManage ? (
          <Button size="lg" onClick={() => setEditor("new")}>
            <PlusIcon data-icon="inline-start" />Tilføj rengøringsopgave
          </Button>
        ) : null}
      </div>
      {tasks === undefined ? (
        <CardGridSkeleton />
      ) : tasks.length === 0 ? (
        <Empty appearance="outlined" className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon"><SprayCanIcon /></EmptyMedia>
            <EmptyTitle>Ingen rengøringsopgaver</EmptyTitle>
            <EmptyDescription>
              {canManage
                ? "Tilføj en opgave med beskrivelse, rengøringsprodukter og en video."
                : "Der er ikke oprettet rengøringsopgaver endnu."}
            </EmptyDescription>
          </EmptyHeader>
          {canManage ? (
            <EmptyContent>
              <Button size="lg" onClick={() => setEditor("new")}>
                <PlusIcon data-icon="inline-start" />Tilføj rengøringsopgave
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              aria-label={`Åbn ${task.name}`}
              className="group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => { setSelected(task); setDetailOpen(true); }}
            >
              <Card appearance="link" className="h-full">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{task.name}</CardTitle>
                    {task.videoUrl ? <PlayCircleIcon aria-label="Har video" className="size-5 shrink-0 text-muted-foreground" /> : null}
                  </div>
                  {task.description ? <p className="line-clamp-2 text-sm whitespace-pre-line text-muted-foreground">{task.description}</p> : null}
                  {task.tools.length ? (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {task.tools.map((tool) => <Badge key={tool.id} variant="secondary">{tool.name}</Badge>)}
                    </div>
                  ) : null}
                </CardHeader>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-(--spacing-dialog-tall) overflow-y-auto sm:max-w-2xl">
          {shown ? (
            <>
              <DialogHeader>
                <DialogTitle>{shown.name}</DialogTitle>
                {shown.description ? <DialogDescription className="whitespace-pre-line">{shown.description}</DialogDescription> : null}
              </DialogHeader>
              {shown.videoUrl ? (
                <video
                  key={shown.videoUrl}
                  src={shown.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="aspect-video w-full rounded-lg bg-black"
                />
              ) : null}
              {shown.tools.length ? (
                <section className="flex flex-col gap-3">
                  <h3 className="text-sm font-medium">Rengøringsprodukter</h3>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {shown.tools.map((tool) => (
                      <li key={tool.id} className="flex min-h-14 items-center gap-3 rounded-lg border p-2">
                        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                          {tool.imageUrl
                            ? <Image src={tool.imageUrl} alt="" fill unoptimized sizes="40px" className="object-cover" />
                            : <SprayCanIcon className="size-5" />}
                        </div>
                        <span className="min-w-0 text-sm">{tool.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {canManage ? (
                <DialogFooter>
                  <Button variant="outline" size="lg" onClick={() => setDeleteOpen(true)}>
                    <Trash2Icon data-icon="inline-start" />Slet
                  </Button>
                  <Button size="lg" onClick={() => { setDetailOpen(false); setEditor(shown); }}>
                    <PencilIcon data-icon="inline-start" />Redigér
                  </Button>
                </DialogFooter>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {editor ? <CleaningTaskEditor key={editor === "new" ? "new" : editor.id} mode={editor} onClose={() => setEditor(null)} /> : null}
      <DeleteCleaningTask
        task={shown}
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => { setDeleteOpen(false); setDetailOpen(false); }}
      />
    </div>
  );
}

type SaveStage = { kind: "compressing"; progress: number } | { kind: "uploading" } | { kind: "saving" } | null;

function CleaningTaskEditor({ mode, onClose }: { mode: Task | "new"; onClose: () => void }) {
  const existing = mode === "new" ? null : mode;
  const [name, setName] = useState(existing?.name ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [toolProductIds, setToolProductIds] = useState<Id<"products">[]>(existing?.tools.map((tool) => tool.id) ?? []);
  const [videoStorageId, setVideoStorageId] = useState(existing?.videoStorageId ?? null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [stage, setStage] = useState<SaveStage>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const categories = useQuery(api.catalog.listCategoryOptions, {});
  const products = useCompleteCatalog(api.catalog.listActiveProductSearchOptionsPage, {});
  const productOptions = useMemo(
    () => products?.map((product) => ({ value: product.id, label: product.name, categoryIds: product.categoryIds })),
    [products],
  );
  const create = useMutation(api.foodSafetyCleaning.create);
  const update = useMutation(api.foodSafetyCleaning.update);
  const generateUploadUrl = useMutation(api.foodSafetyCleaning.generateVideoUploadUrl);
  const saving = stage !== null;
  const hasVideo = Boolean(videoFile || videoStorageId);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    try {
      let storageId = videoStorageId;
      if (videoFile) {
        setStage({ kind: "compressing", progress: 0 });
        const prepared = await compressCleaningVideo(videoFile, (progress) => setStage({ kind: "compressing", progress }));
        if (prepared.size > MAX_CLEANING_VIDEO_BYTES) {
          throw new Error("Videoen fylder over 200 MB og kunne ikke komprimeres i denne browser. Vælg en kortere video.");
        }
        setStage({ kind: "uploading" });
        storageId = await uploadToStorage({ uploadUrl: await generateUploadUrl(), file: prepared });
      }
      setStage({ kind: "saving" });
      const input = { name, description, toolProductIds, videoStorageId: storageId };
      if (existing) await update({ taskId: existing.id, ...input });
      else await create(input);
      toast.success(existing ? "Rengøringsopgaven er opdateret" : "Rengøringsopgaven er oprettet");
      onClose();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Rengøringsopgaven kunne ikke gemmes. Prøv igen."));
      setStage(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-(--spacing-dialog-tall) overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing ? "Redigér rengøringsopgave" : "Ny rengøringsopgave"}</DialogTitle>
          <DialogDescription>Beskriv opgaven, vælg rengøringsprodukterne, og tilføj en video.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} inert={saving} aria-busy={saving} className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="cleaning-task-name">Navn</FieldLabel>
              <Input id="cleaning-task-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
            </Field>
            <Field>
              <FieldLabel htmlFor="cleaning-task-description">Beskrivelse</FieldLabel>
              <Textarea id="cleaning-task-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={4000} rows={5} />
            </Field>
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel>Rengøringsprodukter</FieldLabel>
                <HelpTooltip label="Rengøringsprodukter" content="Vælg de produkter, der bruges til opgaven. Søg på produktets navn eller kategori." />
              </div>
              {productOptions === undefined || categories === undefined ? (
                <Skeleton className="h-11 w-full" />
              ) : (
                <ProductCategoryCombobox
                  categories={categories}
                  products={productOptions}
                  values={toolProductIds}
                  onValuesChange={(values) => setToolProductIds(values as Id<"products">[])}
                  disabled={saving}
                  ariaLabel="Rengøringsprodukter"
                />
              )}
            </Field>
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="cleaning-task-video">Video</FieldLabel>
                <HelpTooltip label="Video" content="Videoen komprimeres til 720p, før den uploades. Kan browseren ikke komprimere den, må den højst fylde 200 MB." />
              </div>
              <Input
                ref={videoInputRef}
                id="cleaning-task-video"
                type="file"
                accept="video/*"
                className="h-auto min-h-11"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file && !file.type.startsWith("video/")) {
                    toast.error("Vælg en videofil.");
                    event.target.value = "";
                    return;
                  }
                  setVideoFile(file);
                }}
              />
              {!videoFile && videoStorageId ? <FieldDescription>Opgaven har en video. Vælg en ny fil for at erstatte den.</FieldDescription> : null}
              {hasVideo ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 self-start"
                  onClick={() => {
                    setVideoFile(null);
                    setVideoStorageId(null);
                    if (videoInputRef.current) videoInputRef.current.value = "";
                  }}
                >
                  <Trash2Icon data-icon="inline-start" />Fjern video
                </Button>
              ) : null}
            </Field>
          </FieldGroup>
          {stage?.kind === "compressing" ? (
            <Progress value={Math.round(stage.progress * 100)}>
              <ProgressLabel>Komprimerer video</ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose}>Annullér</Button>
            <Button type="submit" size="lg">
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {stage?.kind === "uploading" ? "Uploader video…" : "Gem rengøringsopgave"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCleaningTask({ task, open, onClose, onDeleted }: { task: Task | null; open: boolean; onClose: () => void; onDeleted: () => void }) {
  const remove = useMutation(api.foodSafetyCleaning.remove);
  const [pending, setPending] = useState(false);

  async function confirm() {
    if (!task) return;
    setPending(true);
    try {
      await remove({ taskId: task.id });
      toast.success("Rengøringsopgaven er slettet");
      onDeleted();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Rengøringsopgaven kunne ikke slettes. Prøv igen."));
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slet rengøringsopgaven?</AlertDialogTitle>
          <AlertDialogDescription>
            {task?.name} og dens video slettes. Det kan ikke fortrydes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annullér</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? <Spinner data-icon="inline-start" /> : null}Slet
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
