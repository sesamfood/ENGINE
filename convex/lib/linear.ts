import { ConvexError } from "convex/values";

const API_URL = "https://api.linear.app/graphql";
const MAX_TEAMS = 100;
const MAX_LABELS = 100;

export type LinearTeam = {
  id: string;
  key: string;
  name: string;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function requestLinear(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new ConvexError("Linear kunne ikke kontaktes");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ConvexError("Linear afviste API-nøglen");
  }
  if (response.status === 429) {
    throw new ConvexError("Linear har midlertidigt begrænset antal kald");
  }
  if (!response.ok) {
    throw new ConvexError(`Linear svarede med status ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ConvexError("Linear returnerede et ugyldigt svar");
  }
  const body = object(payload);
  const errors = body?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const message = string(object(errors[0])?.message);
    throw new ConvexError(message || "Linear afviste forespørgslen");
  }
  const data = object(body?.data);
  if (!data) throw new ConvexError("Linear returnerede et ugyldigt svar");
  return data;
}

export async function fetchLinearTeams(apiKey: string): Promise<LinearTeam[]> {
  const data = await requestLinear(
    apiKey,
    `query Teams($first: Int!) { teams(first: $first) { nodes { id key name } } }`,
    { first: MAX_TEAMS },
  );
  const nodes = object(data.teams)?.nodes;
  if (!Array.isArray(nodes)) {
    throw new ConvexError("Linear returnerede en ugyldig teamliste");
  }
  return nodes.flatMap((value) => {
    const team = object(value);
    const id = string(team?.id);
    const name = string(team?.name);
    if (!id || !name) return [];
    return [{ id, key: string(team?.key), name }];
  });
}

// Linear workspaces name their labels freely, so match the common spellings
// instead of forcing the organization to create specific labels.
const labelCandidates = {
  bug: ["bug", "fejl", "defect"],
  feature: ["feature", "feature request", "improvement", "enhancement", "forslag", "ønske"],
} as const;

async function findLabelId(
  apiKey: string,
  teamId: string,
  type: "bug" | "feature",
) {
  const data = await requestLinear(
    apiKey,
    `query TeamLabels($teamId: String!, $first: Int!) {
      team(id: $teamId) { labels(first: $first) { nodes { id name } } }
    }`,
    { teamId, first: MAX_LABELS },
  );
  const nodes = object(object(data.team)?.labels)?.nodes;
  if (!Array.isArray(nodes)) return null;
  const labels = nodes.flatMap((value) => {
    const label = object(value);
    const id = string(label?.id);
    const name = string(label?.name).toLowerCase();
    return id && name ? [{ id, name }] : [];
  });
  for (const candidate of labelCandidates[type]) {
    const match = labels.find((label) => label.name === candidate);
    if (match) return match.id;
  }
  return null;
}

export async function createLinearIssue(
  apiKey: string,
  input: {
    teamId: string;
    type: "bug" | "feature";
    title: string;
    description: string;
  },
): Promise<{ identifier: string; url: string }> {
  const labelId = await findLabelId(apiKey, input.teamId, input.type).catch(
    () => null,
  );
  const data = await requestLinear(
    apiKey,
    `mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { identifier url } }
    }`,
    {
      input: {
        teamId: input.teamId,
        title: input.title,
        description: input.description,
        ...(labelId ? { labelIds: [labelId] } : {}),
      },
    },
  );
  const result = object(data.issueCreate);
  const issue = object(result?.issue);
  if (result?.success !== true || !issue) {
    throw new ConvexError("Linear kunne ikke oprette sagen");
  }
  return { identifier: string(issue.identifier), url: string(issue.url) };
}
