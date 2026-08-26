"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  Dialog,
  DialogClose,
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
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";

const PREVIEW_SIZE = 640;
const OUTPUT_SIZE = 1200;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Point = {
  x: number;
  y: number;
};

type DragState = Point & {
  pointerId: number;
};

export type ProductImageCropDialogProps = {
  open: boolean;
  file: File | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File) => void;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function cropSizeFor(image: ImageBitmap, zoom: number) {
  return Math.min(image.width, image.height) / zoom;
}

function clampCenter(
  center: Point,
  image: ImageBitmap,
  cropSize: number,
): Point {
  const halfCrop = cropSize / 2;
  return {
    x: clamp(center.x, halfCrop, image.width - halfCrop),
    y: clamp(center.y, halfCrop, image.height - halfCrop),
  };
}

function outputName(file: File) {
  const baseName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .trim();
  return `${baseName || "produktbillede"}-beskåret.webp`;
}

function canvasBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== "image/webp") {
          reject(new Error("Billedet kunne ikke gemmes som WebP"));
          return;
        }
        resolve(blob);
      },
      "image/webp",
      0.9,
    );
  });
}

export function ProductImageCropDialog({
  open,
  file,
  onOpenChange,
  onConfirm,
}: ProductImageCropDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const centerRef = useRef<Point | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [bitmapFile, setBitmapFile] = useState<File | null>(null);
  const [center, setCenter] = useState<Point | null>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorFile, setErrorFile] = useState<File | null>(null);

  useEffect(() => {
    let active = true;
    let loadedBitmap: ImageBitmap | null = null;
    dragRef.current = null;
    centerRef.current = null;

    if (!open || !file) return;

    void createImageBitmap(file, { imageOrientation: "from-image" })
      .then((nextBitmap) => {
        loadedBitmap = nextBitmap;
        if (!active) {
          nextBitmap.close();
          return;
        }
        const nextCenter = {
          x: nextBitmap.width / 2,
          y: nextBitmap.height / 2,
        };
        centerRef.current = nextCenter;
        setBitmap(nextBitmap);
        setBitmapFile(file);
        setCenter(nextCenter);
        setError(null);
        setErrorFile(null);
      })
      .catch(() => {
        if (!active) return;
        setError("Billedet kunne ikke læses. Vælg et andet billede.");
        setErrorFile(file);
      });

    return () => {
      active = false;
      loadedBitmap?.close();
    };
  }, [file, open]);

  const drawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || !center) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const cropSize = cropSizeFor(bitmap, zoom);
    const cropCenter = clampCenter(center, bitmap, cropSize);
    context.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
    context.imageSmoothingQuality = "high";
    context.drawImage(
      bitmap,
      cropCenter.x - cropSize / 2,
      cropCenter.y - cropSize / 2,
      cropSize,
      cropSize,
      0,
      0,
      PREVIEW_SIZE,
      PREVIEW_SIZE,
    );
  }, [bitmap, center, zoom]);

  useEffect(() => {
    drawPreview();
  }, [drawPreview]);

  const currentBitmap = bitmapFile === file ? bitmap : null;
  const currentError = errorFile === file ? error : null;
  const loading = Boolean(open && file && !currentBitmap && !currentError);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (
      !currentBitmap ||
      !center ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const currentCenter = centerRef.current;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !currentBitmap ||
      !currentCenter
    )
      return;

    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;

    const cropSize = cropSizeFor(currentBitmap, zoom);
    const nextCenter = clampCenter(
      {
        x: currentCenter.x -
          ((event.clientX - drag.x) * cropSize) / bounds.width,
        y: currentCenter.y -
          ((event.clientY - drag.y) * cropSize) / bounds.height,
      },
      currentBitmap,
      cropSize,
    );
    centerRef.current = nextCenter;
    setCenter(nextCenter);
    dragRef.current = {
      pointerId: drag.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const currentCenter = centerRef.current;
    if (!currentBitmap || !currentCenter) return;

    const movement =
      cropSizeFor(currentBitmap, zoom) * (event.shiftKey ? 0.1 : 0.02);
    const nextCenter = { ...currentCenter };
    switch (event.key) {
      case "ArrowLeft":
        nextCenter.x -= movement;
        break;
      case "ArrowRight":
        nextCenter.x += movement;
        break;
      case "ArrowUp":
        nextCenter.y -= movement;
        break;
      case "ArrowDown":
        nextCenter.y += movement;
        break;
      default:
        return;
    }

    event.preventDefault();
    const cropSize = cropSizeFor(currentBitmap, zoom);
    const clampedCenter = clampCenter(nextCenter, currentBitmap, cropSize);
    centerRef.current = clampedCenter;
    setCenter(clampedCenter);
  }

  function endPointerDrag(event: PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  async function confirmCrop() {
    const currentCenter = centerRef.current;
    if (!currentBitmap || !currentCenter || !file) return;

    setProcessing(true);
    setError(null);
    setErrorFile(null);
    try {
      const cropSize = cropSizeFor(currentBitmap, zoom);
      const cropCenter = clampCenter(currentCenter, currentBitmap, cropSize);
      const outputCanvas = document.createElement("canvas");
      outputCanvas.width = OUTPUT_SIZE;
      outputCanvas.height = OUTPUT_SIZE;
      const context = outputCanvas.getContext("2d");
      if (!context) throw new Error("Billedet kunne ikke beskæres");

      context.imageSmoothingQuality = "high";
      context.drawImage(
        currentBitmap,
        cropCenter.x - cropSize / 2,
        cropCenter.y - cropSize / 2,
        cropSize,
        cropSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      const blob = await canvasBlob(outputCanvas);
      onConfirm(new File([blob], outputName(file), { type: "image/webp" }));
      onOpenChange(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Billedet kunne ikke beskæres",
      );
      setErrorFile(file);
    } finally {
      setProcessing(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && processing) return;
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"
        showCloseButton={!processing}
        initialFocus={() => titleRef.current}
      >
        <DialogHeader>
          <DialogTitle ref={titleRef} tabIndex={-1}>
            Beskær produktbillede
          </DialogTitle>
          <DialogDescription>
            Flyt billedet, så det ønskede udsnit ligger i den firkantede ramme.
            Brug skyderen til at zoome.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="product-image-crop-preview">
              Forhåndsvisning
            </FieldLabel>
            <div className="mx-auto w-full max-w-[min(36rem,max(16rem,calc(100dvh-20rem)))] overflow-hidden rounded-xl border bg-muted">
              {loading ? (
                <div className="flex aspect-square flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                  <Spinner />
                  Indlæser billede...
                </div>
              ) : currentError ? (
                <p
                  className="flex aspect-square items-center justify-center p-6 text-center text-sm text-destructive"
                  role="alert"
                >
                  {currentError}
                </p>
              ) : currentBitmap ? (
                <canvas
                  ref={canvasRef}
                  id="product-image-crop-preview"
                  width={PREVIEW_SIZE}
                  height={PREVIEW_SIZE}
                  role="img"
                  aria-label="Forhåndsvisning af beskåret produktbillede"
                  tabIndex={0}
                  className="block aspect-square w-full cursor-grab touch-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none active:cursor-grabbing"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={endPointerDrag}
                  onPointerCancel={endPointerDrag}
                  onLostPointerCapture={endPointerDrag}
                  onKeyDown={handleKeyDown}
                />
              ) : null}
            </div>
            <FieldDescription>
              Træk med musen eller fingeren for at flytte billedet. Brug
              piletasterne, når forhåndsvisningen har fokus.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="product-image-crop-zoom">Zoom</FieldLabel>
            <div className="flex items-center gap-3">
              <Slider
                id="product-image-crop-zoom"
                min={MIN_ZOOM}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onValueChange={(value) => {
                  if (typeof value === "number") setZoom(value);
                }}
                getAriaLabel={() => "Zoom på produktbillede"}
                disabled={!currentBitmap || loading || processing}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>
          </Field>
        </FieldGroup>

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={processing} />
            }
          >
            Annullér
          </DialogClose>
          <Button
            type="button"
            onClick={() => void confirmCrop()}
            disabled={!currentBitmap || loading || processing || Boolean(currentError)}
          >
            {processing ? <Spinner data-icon="inline-start" /> : null}
            {processing ? "Beskærer billede..." : "Anvend beskæring"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
