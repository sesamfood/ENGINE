import {
  strFromU8,
  strToU8,
  unzip,
  zip,
  type AsyncZippable,
  type Unzipped,
} from "fflate";

const ARCHIVE_FORMAT = "product-catalog";
const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_SIZE = 250 * 1024 * 1024;
const MAX_MANIFEST_SIZE = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
export const MAX_PRODUCTS = 5000;
const MAX_CHILDREN = 200;
const MAX_NAME_LENGTH = 100;
const IMAGE_PATH = /^images\/[a-z0-9_-]+\.(?:jpg|png|webp|avif)$/;

const imageExtensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

const imageTypes = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
} as const;

export type ProductExportRow = {
  sourceId: string;
  name: string;
  status: "active" | "archived";
  category: string;
  units: Array<{
    name: string;
    factorToDefault: number;
    isDefault: boolean;
  }>;
  ingredients: Array<{
    sourceProductId: string;
    quantity: number;
    unit: string;
  }>;
  imageUrl: string | null;
};

export type ProductArchiveProduct = Omit<ProductExportRow, "imageUrl"> & {
  image?: string;
};

export type ProductArchive = {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  exportedAt: string;
  products: ProductArchiveProduct[];
};

export type ParsedProductArchive = {
  manifest: ProductArchive;
  files: Unzipped;
};

function archiveError(message: string): never {
  throw new Error(`ZIP-filen er ugyldig: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredName(value: unknown, label: string) {
  if (typeof value !== "string") archiveError(`${label} mangler`);
  const name = value.trim().replace(/\s+/g, " ");
  if (!name || name.length > MAX_NAME_LENGTH) {
    archiveError(`${label} har en ugyldig længde`);
  }
  return name;
}

function requiredKey(value: unknown, label: string) {
  if (typeof value !== "string" || !value || value.length > 200) {
    archiveError(`${label} mangler`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    archiveError(`${label} skal være større end nul`);
  }
  return value;
}

function parseProduct(value: unknown, index: number): ProductArchiveProduct {
  if (!isRecord(value)) archiveError(`produkt ${index + 1} er ugyldigt`);
  if (value.status !== "active" && value.status !== "archived") {
    archiveError(`status for produkt ${index + 1} er ugyldig`);
  }
  if (!Array.isArray(value.units) || value.units.length === 0) {
    archiveError(`produkt ${index + 1} mangler enheder`);
  }
  if (value.units.length > MAX_CHILDREN) {
    archiveError(`produkt ${index + 1} har for mange enheder`);
  }
  if (
    !Array.isArray(value.ingredients) ||
    value.ingredients.length > MAX_CHILDREN
  ) {
    archiveError(`ingredienser for produkt ${index + 1} er ugyldige`);
  }

  const units = value.units.map((unit, unitIndex) => {
    if (!isRecord(unit) || typeof unit.isDefault !== "boolean") {
      return archiveError(
        `enhed ${unitIndex + 1} for produkt ${index + 1} er ugyldig`,
      );
    }
    return {
      name: requiredName(unit.name, "Enhedsnavnet"),
      factorToDefault: positiveNumber(
        unit.factorToDefault,
        "Omregningsfaktoren",
      ),
      isDefault: unit.isDefault,
    };
  });
  if (units.filter((unit) => unit.isDefault).length !== 1) {
    archiveError(`produkt ${index + 1} skal have én standardenhed`);
  }
  if (units.find((unit) => unit.isDefault)!.factorToDefault !== 1) {
    archiveError(`standardenheden for produkt ${index + 1} skal have faktor 1`);
  }
  const normalizedUnits = units.map((unit) =>
    unit.name.toLocaleLowerCase("da"),
  );
  if (new Set(normalizedUnits).size !== normalizedUnits.length) {
    archiveError(`produkt ${index + 1} har en enhed flere gange`);
  }

  const ingredients = value.ingredients.map((ingredient, ingredientIndex) => {
    if (!isRecord(ingredient)) {
      return archiveError(
        `ingrediens ${ingredientIndex + 1} for produkt ${index + 1} er ugyldig`,
      );
    }
    return {
      sourceProductId: requiredKey(ingredient.sourceProductId, "Produktnøglen"),
      quantity: positiveNumber(ingredient.quantity, "Ingrediensmængden"),
      unit: requiredName(ingredient.unit, "Ingrediensenheden"),
    };
  });
  if (
    new Set(ingredients.map((item) => item.sourceProductId)).size !==
    ingredients.length
  ) {
    archiveError(`produkt ${index + 1} har en ingrediens flere gange`);
  }

  const image = value.image;
  if (
    image !== undefined &&
    (typeof image !== "string" || !IMAGE_PATH.test(image))
  ) {
    archiveError(`billedstien for produkt ${index + 1} er ugyldig`);
  }

  return {
    sourceId: requiredKey(value.sourceId, "Produktnøglen"),
    name: requiredName(value.name, "Produktnavnet"),
    status: value.status,
    category: requiredName(value.category, "Kategorinavnet"),
    units,
    ingredients,
    ...(image ? { image } : {}),
  };
}

function parseManifest(value: unknown, files: Unzipped): ProductArchive {
  if (!isRecord(value)) archiveError("manifest.json er ugyldig");
  if (value.format !== ARCHIVE_FORMAT || value.version !== ARCHIVE_VERSION) {
    archiveError("formatet eller versionen understøttes ikke");
  }
  if (
    typeof value.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(value.exportedAt))
  ) {
    archiveError("eksportdatoen er ugyldig");
  }
  if (!Array.isArray(value.products) || value.products.length > MAX_PRODUCTS) {
    archiveError("produktlisten er ugyldig eller for stor");
  }

  const products = value.products.map(parseProduct);
  const sourceIds = new Set(products.map((product) => product.sourceId));
  if (sourceIds.size !== products.length)
    archiveError("produktnøglerne er ikke unikke");

  for (const product of products) {
    if (product.image && !files[product.image]) {
      archiveError(`billedet til ${product.name} mangler`);
    }
    for (const ingredient of product.ingredients) {
      if (!sourceIds.has(ingredient.sourceProductId)) {
        archiveError(
          `en ingrediens til ${product.name} mangler i produktlisten`,
        );
      }
    }
  }

  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: value.exportedAt,
    products,
  };
}

function zipFiles(files: AsyncZippable) {
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (error, data) => {
      if (error) reject(error);
      else resolve(data);
    });
  });
}

function unzipFile(file: File) {
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise<Unzipped>((resolve, reject) => {
        let entryCount = 0;
        let extractedSize = 0;
        let rejection = "";
        unzip(
          new Uint8Array(buffer),
          {
            filter: (entry) => {
              entryCount += 1;
              const allowed =
                entry.name === "manifest.json" || IMAGE_PATH.test(entry.name);
              const limit =
                entry.name === "manifest.json"
                  ? MAX_MANIFEST_SIZE
                  : MAX_IMAGE_SIZE;
              if (entryCount > MAX_PRODUCTS + 1)
                rejection = "ZIP-filen har for mange filer";
              if (allowed && entry.originalSize > limit)
                rejection = `${entry.name} er for stor`;
              if (allowed) extractedSize += entry.originalSize;
              if (extractedSize > MAX_ARCHIVE_SIZE)
                rejection = "ZIP-filen er for stor";
              return allowed && !rejection;
            },
          },
          (error, files) => {
            if (error) reject(error);
            else if (rejection) reject(new Error(rejection));
            else resolve(files);
          },
        );
      }),
  );
}

export async function createProductArchive(products: ProductExportRow[]) {
  if (products.length > MAX_PRODUCTS) {
    throw new Error(`Eksporten kan højst indeholde ${MAX_PRODUCTS.toLocaleString("da-DK")} produkter`);
  }
  const files: AsyncZippable = {};
  const archivedProducts: ProductArchiveProduct[] = [];
  let uncompressedSize = 0;

  for (const [index, product] of products.entries()) {
    let image: string | undefined;
    if (product.imageUrl) {
      const response = await fetch(product.imageUrl);
      if (!response.ok)
        throw new Error(`Billedet til ${product.name} kunne ikke hentes`);
      const contentType = response.headers
        .get("content-type")
        ?.split(";", 1)[0]
        .trim()
        .toLowerCase() as keyof typeof imageExtensions | undefined;
      const extension = contentType ? imageExtensions[contentType] : undefined;
      if (!extension)
        throw new Error(`Billedet til ${product.name} har et ugyldigt format`);
      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader
        ? Number(contentLengthHeader)
        : Number.NaN;
      if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_SIZE) {
        throw new Error(`Billedet til ${product.name} er større end 10 MB`);
      }
      if (
        Number.isFinite(contentLength) &&
        uncompressedSize + contentLength > MAX_ARCHIVE_SIZE
      ) {
        throw new Error("Eksporten må højst indeholde 250 MB ukomprimerede data");
      }
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength > MAX_IMAGE_SIZE) {
        throw new Error(`Billedet til ${product.name} er større end 10 MB`);
      }
      uncompressedSize += data.byteLength;
      if (uncompressedSize > MAX_ARCHIVE_SIZE) {
        throw new Error("Eksporten må højst indeholde 250 MB ukomprimerede data");
      }
      image = `images/${String(index + 1).padStart(5, "0")}.${extension}`;
      files[image] = [data, { level: 0 }];
    }
    archivedProducts.push({
      sourceId: product.sourceId,
      name: product.name,
      status: product.status,
      category: product.category,
      units: product.units,
      ingredients: product.ingredients,
      ...(image ? { image } : {}),
    });
  }

  const manifest: ProductArchive = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    products: archivedProducts,
  };
  const manifestData = strToU8(JSON.stringify(manifest, null, 2));
  if (manifestData.byteLength > MAX_MANIFEST_SIZE) {
    throw new Error("Eksportens produktdata må højst fylde 5 MB");
  }
  if (uncompressedSize + manifestData.byteLength > MAX_ARCHIVE_SIZE) {
    throw new Error("Eksporten må højst indeholde 250 MB ukomprimerede data");
  }
  files["manifest.json"] = manifestData;
  const data = await zipFiles(files);
  return new Blob([new Uint8Array(data)], { type: "application/zip" });
}

export async function readProductArchive(
  file: File,
): Promise<ParsedProductArchive> {
  if (file.size > MAX_ARCHIVE_SIZE)
    throw new Error("ZIP-filen må højst være 250 MB");
  const files = await unzipFile(file).catch((error: unknown) => {
    const message =
      error instanceof Error ? error.message : "ZIP-filen kunne ikke åbnes";
    throw new Error(
      message.startsWith("ZIP-filen")
        ? message
        : `ZIP-filen kunne ikke åbnes: ${message}`,
    );
  });
  const manifestFile = files["manifest.json"];
  if (!manifestFile) archiveError("manifest.json mangler");

  let value: unknown;
  try {
    value = JSON.parse(strFromU8(manifestFile));
  } catch {
    archiveError("manifest.json indeholder ugyldig JSON");
  }
  return { manifest: parseManifest(value, files), files };
}

export function archiveImageBlob(path: string, files: Unzipped) {
  const extension = path.split(".").pop() as keyof typeof imageTypes;
  const type = imageTypes[extension];
  const data = files[path];
  if (!type || !data) archiveError("et produktbillede mangler");
  return new Blob([data], { type });
}

export function downloadProductArchive(blob: Blob) {
  const date = new Intl.DateTimeFormat("sv-SE").format(new Date());
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `produkter-${date}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
}
