type ImageCompressionOptions = {
  maxWidth: number;
  maxHeight: number;
  quality?: number;
};

export async function compressImage(
  file: File,
  { maxWidth, maxHeight, quality = 0.86 }: ImageCompressionOptions,
) {
  const image = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  try {
    const scale = Math.min(
      1,
      maxWidth / image.width,
      maxHeight / image.height,
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Billedet kunne ikke komprimeres");

    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const compressed = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error("Billedet kunne ikke komprimeres")),
        "image/webp",
        quality,
      );
    });

    return scale < 1 || compressed.size < file.size ? compressed : file;
  } finally {
    image.close();
  }
}
