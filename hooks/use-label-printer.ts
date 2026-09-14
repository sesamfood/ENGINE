"use client";

import { useMemo, useSyncExternalStore } from "react";
import { z } from "zod";
import type { Id } from "@/convex/_generated/dataModel";
import { dateLabelImage } from "@/lib/date-label-image";
import type { DateLabel, LabelFormat } from "@/lib/date-label-print";
import {
  printerResponseSchema,
  qzPrintJob,
  qzPrintOptions,
  type PrinterRequest,
} from "@/lib/qz-print-job";

const pairingSchema = z.object({
  host: z.string(),
  printer: z.string().min(1).max(250),
});
const listeners = new Set<() => void>();
const savedPairings = new Map<string, string | null>();
const failedWrites = new Set<string>();
const initialConnection = {
  host: null as string | null,
  connected: false,
  busy: false,
  signed: false,
  printers: [] as string[],
};
let connection = initialConnection;
let certificate: string | null = null;
let qzPromise: Promise<typeof import("qz-tray")> | undefined;
function notify() {
  for (const callback of listeners) callback();
}
function update(patch: Partial<typeof connection>) {
  connection = { ...connection, ...patch };
  notify();
}
function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}
function readPairing(key: string) {
  if (failedWrites.has(key)) return savedPairings.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return savedPairings.get(key) ?? null;
  }
}
function writePairing(key: string, value: string | null) {
  savedPairings.set(key, value);
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
    failedWrites.delete(key);
  } catch {
    failedWrites.add(key);
  }
  notify();
}

export function printerHost(value: string) {
  const host = value.trim().toLowerCase();
  if (host === "localhost") return host;
  if (
    host.length > 253 ||
    !host.includes(".") ||
    !host
      .split(".")
      .every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))
  ) {
    throw new Error(
      "Angiv localhost eller printtjenestens fulde værtsnavn, f.eks. print.example.dk. Brug ikke printerens IP-adresse",
    );
  }
  return host;
}

async function requestPrinter(body: PrinterRequest) {
  const response = await fetch("/api/date-labels/printer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(result);
    throw new Error(
      error.success
        ? error.data.error
        : "Printtjenesten kunne ikke godkende forespørgslen",
    );
  }
  return printerResponseSchema.parse(result);
}

async function getQz() {
  qzPromise ??= import("qz-tray").then((module) => {
    const qz = module.default;
    qz.websocket.setClosedCallbacks(() =>
      update({ connected: false, host: null, printers: [] }),
    );
    qz.security.setSignatureAlgorithm("SHA512");
    return qz;
  });
  return qzPromise;
}

function prepareSignature(
  qz: typeof import("qz-tray"),
  proof: z.infer<typeof printerResponseSchema>,
) {
  qz.security.setSignaturePromise((hash) => (resolve, reject) => {
    if (proof.certificate && hash !== proof.hash) {
      reject("Printerforespørgslen stemmer ikke med signaturen");
      return;
    }
    resolve(proof.signature);
  });
}

async function ensureConnected(host: string, locationId: Id<"locations">) {
  const authorization = await requestPrinter({
    action: "certificate",
    locationId,
  });
  const qz = await getQz();
  if (
    qz.websocket.isActive() &&
    (connection.host !== host || certificate !== authorization.certificate)
  )
    await qz.websocket.disconnect();
  if (!qz.websocket.isActive()) {
    certificate = authorization.certificate;
    qz.security.setCertificatePromise((resolve) => resolve(certificate ?? ""));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        qz.websocket.connect({
          host,
          usingSecure: true,
          retries: 0,
          keepAlive: 30,
        }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            void qz.websocket.disconnect().catch(() => {});
            reject(
              new Error(
                "Forbindelsen tog for lang tid. Kontrollér QZ Tray, værtsnavn, certifikat og adgang til det lokale netværk",
              ),
            );
          }, 45_000);
        }),
      ]);
    } catch (error) {
      update({ connected: false, host: null, printers: [] });
      throw new Error(
        error instanceof Error && error.message.startsWith("Forbindelsen tog")
          ? error.message
          : "Kunne ikke forbinde. Start QZ Tray, godkend forbindelsen, og kontrollér værtsnavn og certifikat",
      );
    } finally {
      clearTimeout(timeout);
    }
    const version = await qz.api.getVersion();
    const [major, minor] = version.split(".").map(Number);
    if (!Number.isFinite(major) || major < 2 || (major === 2 && minor < 2)) {
      await qz.websocket.disconnect();
      throw new Error("Opdatér QZ Tray til version 2.2 eller nyere");
    }
    update({
      host,
      connected: true,
      signed: Boolean(certificate),
      printers: [],
    });
  }
  return qz;
}

async function findPrinters(host: string, locationId: Id<"locations">) {
  const qz = await ensureConnected(host, locationId);
  const proof = await requestPrinter({ action: "find", locationId });
  if (proof.certificate !== certificate)
    throw new Error("Printtjenestens certifikat er ændret. Forbind igen");
  prepareSignature(qz, proof);
  const result = await qz.printers.find(undefined, undefined, proof.timestamp);
  const printers = typeof result === "string" ? [result] : result;
  update({ printers });
  return printers;
}

async function exclusive<T>(operation: () => Promise<T>) {
  if (connection.busy) throw new Error("Vent, mens printtjenesten arbejder");
  update({ busy: true });
  try {
    return await operation();
  } finally {
    update({ busy: false });
  }
}

export function useLabelPrinter(
  organizationId: string,
  locationId: Id<"locations">,
) {
  const key = `engine.date-labels.printer.${organizationId}.${locationId}`;
  const stored = useSyncExternalStore(
    subscribe,
    () => readPairing(key),
    () => null,
  );
  const pairing = useMemo(() => {
    try {
      const parsed = pairingSchema.parse(JSON.parse(stored ?? "null"));
      return { ...parsed, host: printerHost(parsed.host) };
    } catch {
      return null;
    }
  }, [stored]);
  const state = useSyncExternalStore(
    subscribe,
    () => connection,
    () => initialConnection,
  );
  return {
    pairing,
    ...state,
    pairedConnection: Boolean(
      pairing &&
      state.connected &&
      state.host === pairing.host &&
      state.printers.includes(pairing.printer),
    ),
    connect: (host: string) =>
      exclusive(() => findPrinters(printerHost(host), locationId)),
    pair: (host: string, printer: string) => {
      const normalized = printerHost(host);
      if (
        !state.connected ||
        state.host !== normalized ||
        !state.printers.includes(printer)
      )
        throw new Error("Find printere, og vælg en printer fra listen");
      writePairing(key, JSON.stringify({ host: normalized, printer }));
    },
    forget: () => writePairing(key, null),
    print: async (label: DateLabel, format: LabelFormat, copies: number) => {
      if (!pairing) throw new Error("Tilslut en printer først");
      return exclusive(async () => {
        const image = dateLabelImage(label, format);
        const qz = await ensureConnected(pairing.host, locationId);
        const printers = connection.printers.length
          ? connection.printers
          : await findPrinters(pairing.host, locationId);
        if (!printers.includes(pairing.printer))
          throw new Error(
            "Den gemte printer findes ikke længere. Vælg printer igen",
          );
        const proof = await requestPrinter({
          action: "print",
          locationId,
          printer: pairing.printer,
          image,
          format,
          copies,
        });
        if (proof.certificate !== certificate)
          throw new Error("Printtjenestens certifikat er ændret. Forbind igen");
        const job = qzPrintJob(pairing.printer, image, format, copies);
        prepareSignature(qz, proof);
        try {
          await qz.print(
            qz.configs.create(job.printer.name, qzPrintOptions(format, copies)),
            job.data,
            [undefined],
            proof.timestamp,
          );
        } catch {
          // A lost acknowledgement must never trigger an automatic reprint.
          throw new Error(
            "Print blev ikke bekræftet. Kontrollér printerkøen, før du prøver igen",
          );
        }
      });
    },
  };
}

export type LabelPrinter = ReturnType<typeof useLabelPrinter>;
