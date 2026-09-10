import { z } from "zod";
import { env } from "../_generated/server";

const messages = {
  notConfigured: "Google Places er ikke konfigureret. Kontakt en administrator.",
  notFound: "Google-lokationen findes ikke længere. Vælg den igen i lokationens oplysninger.",
  moved: "Google-lokationen er flyttet. Vælg den igen i lokationens oplysninger.",
  rateLimited: "Google Places er optaget. Vent et øjeblik, og prøv igen.",
  unavailable: "Oplysningerne kunne ikke hentes fra Google. Prøv igen senere.",
};

export class GooglePlacesError extends Error {
  constructor(readonly code: keyof typeof messages) {
    super(messages[code]);
    this.name = "GooglePlacesError";
  }
}

export const googlePlaceIdSchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/);
export const googleSessionTokenSchema = z.string().uuid();

const attributionSchema = z.object({
  provider: z.string().max(500),
  providerUri: z.string().url().refine((uri) => new URL(uri).protocol === "https:").optional(),
});
const placeSchema = z.object({
  id: googlePlaceIdSchema,
  movedPlaceId: googlePlaceIdSchema.optional(),
  displayName: z.object({ text: z.string().max(500) }).optional(),
  formattedAddress: z.string().max(1000).optional(),
  businessStatus: z.string().max(100).optional(),
  types: z.array(z.string().max(100)).max(100).optional(),
  rating: z.number().min(1).max(5).optional(),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).optional(),
  postalAddress: z.object({ regionCode: z.string().max(10).optional() }).optional(),
  addressComponents: z.array(z.object({
    shortText: z.string().max(500).optional(),
    types: z.array(z.string().max(100)).max(20).default([]),
  })).max(100).optional(),
  attributions: z.array(attributionSchema).max(20).optional(),
});
const searchSchema = z.object({
  suggestions: z.array(z.object({
    placePrediction: z.object({
      placeId: googlePlaceIdSchema,
      text: z.object({ text: z.string().max(1500) }),
      structuredFormat: z.object({
        mainText: z.object({ text: z.string().max(500) }),
        secondaryText: z.object({ text: z.string().max(1000) }).optional(),
      }).optional(),
    }).optional(),
  })).max(5).optional(),
});

async function request(path: string, fields: string, body?: unknown) {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) throw new GooglePlacesError("notConfigured");
  try {
    const response = await fetch(`https://places.googleapis.com/v1/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fields },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
      cache: "no-store",
    });
    if (response.status === 404) throw new GooglePlacesError("notFound");
    if (response.status === 429) throw new GooglePlacesError("rateLimited");
    if (!response.ok) throw new GooglePlacesError("unavailable");
    if (Number(response.headers.get("Content-Length")) > 100_000) throw new GooglePlacesError("unavailable");
    const text = await response.text();
    if (text.length > 100_000) throw new GooglePlacesError("unavailable");
    const data: unknown = JSON.parse(text);
    return data;
  } catch (error) {
    if (error instanceof GooglePlacesError) throw error;
    throw new GooglePlacesError("unavailable");
  }
}

async function readPlace(placeId: string, fields: string, sessionToken?: string) {
  const id = googlePlaceIdSchema.parse(placeId);
  const params = new URLSearchParams({ languageCode: "da" });
  if (sessionToken) params.set("sessionToken", googleSessionTokenSchema.parse(sessionToken));
  const parsed = placeSchema.safeParse(await request(`places/${encodeURIComponent(id)}?${params}`, fields));
  if (!parsed.success) throw new GooglePlacesError("unavailable");
  if (parsed.data.movedPlaceId || parsed.data.id !== id) throw new GooglePlacesError("moved");
  return parsed.data;
}

export async function searchGooglePlaces({ query, sessionToken, countryCode, bias }: {
  query: string;
  sessionToken: string;
  countryCode?: string;
  bias?: { latitude: number; longitude: number };
}) {
  const data = await request("places:autocomplete", "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat", {
    input: query,
    sessionToken: googleSessionTokenSchema.parse(sessionToken),
    languageCode: "da",
    includeQueryPredictions: false,
    ...(countryCode ? { regionCode: countryCode === "GB" ? "uk" : countryCode.toLowerCase() } : {}),
    locationBias: bias
      ? { circle: { center: bias, radius: 50_000 } }
      : { rectangle: { low: { latitude: -90, longitude: -180 }, high: { latitude: 90, longitude: 180 } } },
  });
  const parsed = searchSchema.safeParse(data);
  if (!parsed.success) throw new GooglePlacesError("unavailable");
  return (parsed.data.suggestions ?? []).flatMap(({ placePrediction: place }) => place ? [{
    placeId: place.placeId,
    mainText: place.structuredFormat?.mainText.text ?? place.text.text,
    secondaryText: place.structuredFormat?.secondaryText?.text ?? "",
  }] : []);
}

export async function readGoogleDetails(placeId: string, sessionToken?: string) {
  const place = await readPlace(placeId, "id,displayName,formattedAddress,types,businessStatus,attributions,movedPlaceId", sessionToken);
  return {
    placeId: place.id,
    displayName: place.displayName?.text ?? "",
    address: place.formattedAddress ?? "",
    ...(place.businessStatus ? { businessStatus: place.businessStatus } : {}),
    types: place.types ?? [],
    attributions: place.attributions ?? [],
  };
}

export async function verifyGooglePlace(placeId: string) {
  await readPlace(placeId, "id,movedPlaceId");
}

export async function readGoogleRating(placeId: string) {
  const place = await readPlace(placeId, "id,rating,attributions,movedPlaceId");
  return { rating: place.rating ?? null, attributions: place.attributions ?? [] };
}

export async function readGooglePoint(placeId: string) {
  const place = await readPlace(placeId, "id,location,postalAddress.regionCode,addressComponents,movedPlaceId");
  if (!place.location) throw new GooglePlacesError("notFound");
  const components = place.addressComponents ?? [];
  const countryCode = [
    place.postalAddress?.regionCode,
    ...components.filter((component) => component.types.includes("country")).map((component) => component.shortText),
  ].map((value) => value?.trim().toUpperCase()).find((value) => value && /^[A-Z]{2}$/.test(value));
  if (!countryCode) throw new GooglePlacesError("unavailable");
  return {
    ...place.location,
    countryCode,
  };
}
