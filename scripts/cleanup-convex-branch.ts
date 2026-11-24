import {
  PROTECTED_BRANCHES,
  toBranchDeploymentRef,
} from "./lib/convex-branch-ref";

type ConvexDeployment = {
  name: string;
  deploymentType: string;
  isDefault: boolean;
  reference: string;
};

type Options = {
  branch?: string;
  dryRun: boolean;
  help: boolean;
};

const CONVEX_API_BASE = "https://api.convex.dev/v1";

function printHelp() {
  console.log(`Usage: bun scripts/cleanup-convex-branch.ts [options]

Deletes the non-default branched Convex dev deployment matching a merged PR branch.
No-ops cleanly if no matching non-default dev deployment exists.

Environment variables:
  CONVEX_ACCESS_TOKEN   Convex Team or Personal Access Token (required)
  CONVEX_PROJECT_ID     Numeric Convex project ID (required)
  BRANCH_NAME           Git branch name (used when --branch is omitted)

Options:
  --branch <name>       Git branch name to clean up
  --dry-run             Log what would be deleted without deleting
  -h, --help            Show this help message`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--branch") {
      const value = argv[++i];
      if (!value || value.startsWith("-")) {
        throw new Error("Missing value for --branch");
      }
      options.branch = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function warn(message: string) {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning::${message}`);
  } else {
    console.warn(`Warning: ${message}`);
  }
}

function isDeploymentRecord(value: unknown): value is ConvexDeployment {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.deploymentType === "string" &&
    typeof record.isDefault === "boolean" &&
    typeof record.reference === "string"
  );
}

async function listNonDefaultDeployments(
  projectId: string,
  token: string,
): Promise<ConvexDeployment[]> {
  const url = `${CONVEX_API_BASE}/projects/${encodeURIComponent(projectId)}/list_deployments?isDefault=false`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Convex list_deployments failed (${response.status} ${response.statusText}): ${body}`,
    );
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Unexpected response from Convex list_deployments (expected array).");
  }

  return payload.filter(isDeploymentRecord);
}

async function deleteDeployment(deploymentName: string, token: string) {
  const url = `${CONVEX_API_BASE}/deployments/${encodeURIComponent(deploymentName)}/delete`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Convex delete deployment "${deploymentName}" failed (${response.status} ${response.statusText}): ${body}`,
    );
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const branchName = (options.branch ?? process.env.BRANCH_NAME ?? "").trim();
  if (!branchName) {
    throw new Error("Missing branch name (pass --branch <name> or set BRANCH_NAME).");
  }

  if (PROTECTED_BRANCHES.has(branchName.toLowerCase())) {
    console.log(`Skipping protected branch "${branchName}".`);
    return;
  }

  const token = (process.env.CONVEX_ACCESS_TOKEN ?? "").trim();
  const projectId = (process.env.CONVEX_PROJECT_ID ?? "").trim();
  if (!token || !projectId) {
    warn(
      "Skipping Convex branch cleanup: CONVEX_ACCESS_TOKEN and/or CONVEX_PROJECT_ID are not configured.",
    );
    return;
  }

  if (!/^\d+$/.test(projectId)) {
    throw new Error(
      `CONVEX_PROJECT_ID must be a numeric Convex project ID, got "${projectId}".`,
    );
  }

  const expectedRef = toBranchDeploymentRef(branchName);
  if (!expectedRef.startsWith("dev/") || expectedRef === "dev/") {
    throw new Error(`Refusing to operate on invalid reference "${expectedRef}".`);
  }

  const deployments = await listNonDefaultDeployments(projectId, token);

  // Defense in depth: only ever match an explicit non-default `dev` deployment
  // whose exact reference matches the branch. Default dev and prod deployments
  // are never eligible.
  const matches = deployments.filter(
    (deployment) =>
      deployment.deploymentType === "dev" &&
      deployment.isDefault === false &&
      deployment.reference === expectedRef,
  );

  if (matches.length === 0) {
    console.log(
      `No branched Convex dev deployment found for "${expectedRef}" (branch "${branchName}"). Nothing to delete.`,
    );
    return;
  }

  if (matches.length > 1) {
    throw new Error(
      `Expected at most 1 deployment matching "${expectedRef}", found ${matches.length}. Refusing to delete.`,
    );
  }

  const target = matches[0];
  if (options.dryRun) {
    console.log(
      `[dry-run] Would delete Convex dev deployment "${target.name}" (reference: "${target.reference}").`,
    );
    return;
  }

  console.log(
    `Deleting branched Convex dev deployment "${target.name}" (reference: "${target.reference}")...`,
  );
  await deleteDeployment(target.name, token);
  console.log(`Deleted Convex deployment "${target.name}".`);
}

main().catch((error) => {
  console.error(
    error instanceof Error ? `Error: ${error.message}` : String(error),
  );
  process.exit(1);
});
