import { ConvexError } from "convex/values";

const API_URL = "https://api.notion.com/v1";
const API_VERSION = "2026-03-11";
const MAX_DATABASES = 100;
// Notion rejects rich text objects longer than this.
const MAX_TEXT_LENGTH = 2_000;

// A project is an option of a select property, or a page linked through a
// relation property (then `pageId` is set).
export type NotionProject = { property: string; name: string; pageId?: string };

export type NotionDatabase = {
  id: string;
  name: string;
  projects: NotionProject[];
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requestNotion(
  token: string,
  path: string,
  body: Record<string, unknown>,
) {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Notion-Version": API_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ConvexError("Notion kunne ikke kontaktes");
  }

  if (response.status === 401) {
    throw new ConvexError("Notion afviste nøglen");
  }
  if (response.status === 403 || response.status === 404) {
    throw new ConvexError(
      "Notion gav ikke adgang. Del databasen med integrationen",
    );
  }
  if (response.status === 429) {
    throw new ConvexError("Notion har midlertidigt begrænset antal kald");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ConvexError("Notion returnerede et ugyldigt svar");
  }
  const data = object(payload);
  if (!response.ok) {
    const message = string(data?.message);
    throw new ConvexError(
      message || `Notion svarede med status ${response.status}`,
    );
  }
  if (!data) throw new ConvexError("Notion returnerede et ugyldigt svar");
  return data;
}

function plainText(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value
    .map((part) => string(object(part)?.plain_text))
    .join("")
    .trim();
}

function selectOptions(properties: unknown): NotionProject[] {
  return Object.values(object(properties) ?? {}).flatMap((value) => {
    const property = object(value);
    const name = string(property?.name);
    const options = object(property?.select)?.options;
    if (property?.type !== "select" || !name || !Array.isArray(options)) {
      return [];
    }
    return options.flatMap((option) => {
      const optionName = string(object(option)?.name);
      return optionName ? [{ property: name, name: optionName }] : [];
    });
  });
}

function relationTargets(properties: unknown) {
  return Object.values(object(properties) ?? {}).flatMap((value) => {
    const property = object(value);
    const name = string(property?.name);
    const target = string(object(property?.relation)?.data_source_id);
    return property?.type === "relation" && name && target
      ? [{ property: name, target }]
      : [];
  });
}

function pageTitle(properties: unknown) {
  const title = Object.values(object(properties) ?? {})
    .map(object)
    .find((property) => property?.type === "title");
  return plainText(title?.title);
}

// Related databases the integration cannot read yield no pages.
async function fetchPages(token: string, dataSourceId: string) {
  try {
    const data = await requestNotion(
      token,
      `/data_sources/${encodeURIComponent(dataSourceId)}/query`,
      { page_size: MAX_DATABASES },
    );
    const results = Array.isArray(data.results) ? data.results : [];
    return results.flatMap((value) => {
      const page = object(value);
      const id = string(page?.id);
      const name = pageTitle(page?.properties);
      return id && name ? [{ id, name }] : [];
    });
  } catch {
    return [];
  }
}

export async function fetchNotionDatabases(
  token: string,
): Promise<NotionDatabase[]> {
  const data = await requestNotion(token, "/search", {
    filter: { property: "object", value: "data_source" },
    page_size: MAX_DATABASES,
  });
  const results = data.results;
  if (!Array.isArray(results)) {
    throw new ConvexError("Notion returnerede en ugyldig databaseliste");
  }
  const sources = results.flatMap((value) => {
    const source = object(value);
    const id = string(source?.id);
    if (!id || source?.object !== "data_source") return [];
    return [{ id, source, relations: relationTargets(source.properties) }];
  });
  const targets = [
    ...new Set(sources.flatMap(({ relations }) => relations.map((r) => r.target))),
  ];
  const pages = new Map(
    await Promise.all(
      targets.map(async (target) => [target, await fetchPages(token, target)] as const),
    ),
  );
  return sources.map(({ id, source, relations }) => ({
    id,
    name: plainText(source.title) || "Unavngivet database",
    projects: [
      ...selectOptions(source.properties),
      ...relations.flatMap(({ property, target }) =>
        (pages.get(target) ?? []).map((page) => ({
          property,
          name: page.name,
          pageId: page.id,
        })),
      ),
    ],
  }));
}

export type NotionText = { text: string; bold?: boolean; url?: string };

function richText(parts: NotionText[]) {
  return parts.flatMap((part) => {
    const chunks: string[] = [];
    for (let i = 0; i < part.text.length; i += MAX_TEXT_LENGTH) {
      chunks.push(part.text.slice(i, i + MAX_TEXT_LENGTH));
    }
    return chunks.map((content) => ({
      type: "text",
      text: { content, ...(part.url ? { link: { url: part.url } } : {}) },
      ...(part.bold ? { annotations: { bold: true } } : {}),
    }));
  });
}

export async function createNotionPage(
  token: string,
  input: {
    databaseId: string;
    project: NotionProject | null;
    title: string;
    paragraphs: NotionText[][];
    imageUrl: string | null;
  },
): Promise<{ url: string }> {
  const data = await requestNotion(token, "/pages", {
    parent: { data_source_id: input.databaseId },
    // Every data source has a title property with the fixed id "title".
    properties: {
      title: { title: richText([{ text: input.title }]) },
      ...(input.project
        ? {
            [input.project.property]: input.project.pageId
              ? { relation: [{ id: input.project.pageId }] }
              : { select: { name: input.project.name } },
          }
        : {}),
    },
    children: [
      ...input.paragraphs.map((parts) => ({
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richText(parts) },
      })),
      ...(input.imageUrl
        ? [
            {
              object: "block",
              type: "image",
              image: { type: "external", external: { url: input.imageUrl } },
            },
          ]
        : []),
    ],
  });
  return { url: string(data.url) };
}
