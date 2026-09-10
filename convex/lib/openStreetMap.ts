import { z } from "zod";

const MAX_RESPONSE_BYTES = 100_000;
const responseSchema = z.object({
  address: z.record(z.string().max(100), z.string().max(1000)),
});

export async function readOpenStreetMapRegion(
  point: { latitude: number; longitude: number; countryCode: string },
  config: { baseUrl: string; userAgent: string },
): Promise<string | null> {
  try {
    const countryCode = point.countryCode.trim().toUpperCase();
    if (
      !Number.isFinite(point.latitude) || Math.abs(point.latitude) > 90 ||
      !Number.isFinite(point.longitude) || Math.abs(point.longitude) > 180 ||
      !/^[A-Z]{2}$/.test(countryCode) || !config.userAgent.trim()
    ) throw new Error();
    const url = new URL(config.baseUrl);
    url.pathname = `${url.pathname.replace(/\/$/, "")}/reverse`;
    url.search = new URLSearchParams({
      lat: String(point.latitude),
      lon: String(point.longitude),
      format: "jsonv2",
      addressdetails: "1",
      layer: "address",
      zoom: "18",
    }).toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": config.userAgent },
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok || !response.body || Number(response.headers.get("Content-Length")) > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error();
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let bytes = 0;
    let text = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) throw new Error();
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally {
      await reader.cancel();
    }
    const data: unknown = JSON.parse(text);
    const { address } = responseSchema.parse(data);
    if (address.country_code?.toUpperCase() !== countryCode) throw new Error();
    let subdivisionCode: string | null = null;
    let selectedLevel = Infinity;
    for (const [tag, value] of Object.entries(address)) {
      const match = /^ISO3166-2-lvl([1-9]\d?)$/.exec(tag);
      if (!match) continue;
      const code = value.trim().toUpperCase();
      if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code) || !code.startsWith(`${countryCode}-`)) {
        throw new Error();
      }
      const level = Number(match[1]);
      if (level < selectedLevel) {
        selectedLevel = level;
        subdivisionCode = code;
      }
    }
    return subdivisionCode;
  } catch {
    throw new Error("Regionskoden kunne ikke hentes fra OpenStreetMap.");
  }
}
