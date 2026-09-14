import {
  createHash,
  createPrivateKey,
  sign,
  X509Certificate,
} from "node:crypto";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchAuthQuery } from "@/lib/auth-server";
import { labelFormats } from "@/lib/date-label-print";
import { printerRequestSchema, qzPrintJob } from "@/lib/qz-print-job";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const error = (message: string, status: number) =>
    Response.json({ error: message }, { status, headers });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return error("Ugyldig oprindelse", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return error("Ugyldig forespørgsel", 415);
  if (Number(request.headers.get("content-length")) > 1_100_000)
    return error("Etiketten er for stor", 413);

  let body;
  try {
    const text = await request.text();
    if (text.length > 1_100_000) return error("Etiketten er for stor", 413);
    body = printerRequestSchema.parse(JSON.parse(text));
  } catch {
    return error("Ugyldig printerforespørgsel", 400);
  }
  try {
    await fetchAuthQuery(api.dateLabels.authorizePrinter, {
      locationId: body.locationId as Id<"locations">,
    });
  } catch {
    return error(
      "Du har ikke adgang til at printe på denne lokation. Log ind igen, hvis din session er udløbet",
      403,
    );
  }

  if (body.action === "print") {
    const png = Buffer.from(body.image, "base64");
    const size = labelFormats.find((item) => item.value === body.format)!;
    if (
      png.length < 33 ||
      png.toString("hex", 0, 8) !== "89504e470d0a1a0a" ||
      png.toString("ascii", 12, 16) !== "IHDR" ||
      png.readUInt32BE(16) !== Math.round((size.width * 300) / 25.4) ||
      png.readUInt32BE(20) !== Math.round((size.height * 300) / 25.4)
    )
      return error("Ugyldigt etiketbillede", 400);
  }
  const certificate =
    process.env.QZ_CERTIFICATE?.replace(/\\n/g, "\n").trim() || null;
  const privateKey =
    process.env.QZ_PRIVATE_KEY?.replace(/\\n/g, "\n").trim() || null;
  if (Boolean(certificate) !== Boolean(privateKey))
    return error("Printtjenestens signering er ikke færdigkonfigureret", 503);
  const timestamp = Date.now();
  let signature = "";
  let hash: string | null = null;
  if (certificate && privateKey) {
    try {
      const key = createPrivateKey(privateKey);
      const cert = new X509Certificate(certificate);
      if (
        key.asymmetricKeyType !== "rsa" ||
        !cert.checkPrivateKey(key) ||
        timestamp < Date.parse(cert.validFrom) ||
        timestamp >= Date.parse(cert.validTo)
      )
        return error(
          "Printtjenestens certifikat er ugyldigt eller udløbet",
          503,
        );
      if (body.action !== "certificate") {
        // Construct the allowlisted operation here; never sign caller-supplied QZ commands or hashes.
        const call = body.action === "find" ? "printers.find" : "print";
        const params =
          body.action === "find"
            ? {}
            : qzPrintJob(body.printer, body.image, body.format, body.copies);
        hash = createHash("sha256")
          .update(JSON.stringify({ call, params, timestamp }))
          .digest("hex");
        signature = sign("RSA-SHA512", Buffer.from(hash), key).toString(
          "base64",
        );
      }
    } catch {
      return error("Printtjenestens signering kunne ikke indlæses", 503);
    }
  }
  return Response.json(
    { certificate, signature, timestamp, hash },
    { headers },
  );
}
