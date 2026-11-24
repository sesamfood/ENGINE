import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { toBranchDeploymentRef } from "./lib/convex-branch-ref";

type Options = {
  name?: string;
  source: string;
  expiration: string;
  includeFileStorage: boolean;
  skipData: boolean;
  skipPush: boolean;
  skipInstall: boolean;
  reseed: boolean;
  worktreeOnly: boolean;
  help: boolean;
};

function printHelp() {
  console.log(`Usage: bun run convex:branch [name] [options]

Create (or select) an isolated Convex dev deployment for the current branch/worktree,
copy Convex environment variables from the source deployment, push backend code,
and seed it with a snapshot export.

Options:
  --name <slug>         Explicit deployment name (default: derived from git branch)
  --source <ref>        Source deployment to clone from (default: dev)
  --expiration <value>  Deployment expiration (default: "in 5 days"; use "none" to keep)
  --no-files            Skip file storage when exporting/importing snapshot
  --no-data             Skip data export/import (create deployment + env + push only)
  --no-push             Skip \`convex dev --once\` push
  --reseed              Re-copy env vars and re-import data even if deployment exists
  --worktree-only       Exit cleanly when run in the main checkout instead of a worktree
  --skip-install        Skip automatic \`bun install\` when node_modules is missing
  -h, --help            Show this help message`);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    source: "dev",
    expiration: "in 5 days",
    includeFileStorage: true,
    skipData: false,
    skipPush: false,
    skipInstall: false,
    reseed: false,
    worktreeOnly: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "--name") {
      options.name = requireValue(argv, ++i, "--name");
    } else if (arg === "--source") {
      options.source = requireValue(argv, ++i, "--source");
    } else if (arg === "--expiration") {
      options.expiration = requireValue(argv, ++i, "--expiration");
    } else if (arg === "--no-files") {
      options.includeFileStorage = false;
    } else if (arg === "--no-data") {
      options.skipData = true;
    } else if (arg === "--no-push") {
      options.skipPush = true;
    } else if (arg === "--reseed") {
      options.reseed = true;
    } else if (arg === "--worktree-only") {
      options.worktreeOnly = true;
    } else if (arg === "--skip-install") {
      options.skipInstall = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (!options.name) {
      options.name = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value || value.startsWith("-")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function convexChildEnv(): NodeJS.ProcessEnv {
  // Bun auto-loads .env.local into process.env at startup; clear Convex vars so
  // child CLI calls always read the updated .env.local on disk.
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  delete env.CONVEX_URL;
  delete env.NEXT_PUBLIC_CONVEX_URL;
  delete env.NEXT_PUBLIC_CONVEX_SITE_URL;
  return env;
}

function runCapture(
  cmd: string,
  args: string[],
  opts?: SpawnSyncOptions,
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status ?? 1,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
  };
}

function runInherit(cmd: string, args: string[], opts?: SpawnSyncOptions) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `Command failed (exit ${result.status ?? "unknown"}): ${cmd} ${args.join(" ")}`,
    );
  }
}

function runConvexCapture(args: string[]) {
  return runCapture("bunx", ["convex", ...args], { env: convexChildEnv() });
}

function runConvexInherit(args: string[]) {
  return runInherit("bunx", ["convex", ...args], { env: convexChildEnv() });
}

function getGitContext(): {
  isWorktree: boolean;
  mainRepoRoot: string;
  branchName: string;
} {
  const gitDirRes = runCapture("git", ["rev-parse", "--git-dir"]);
  const commonDirRes = runCapture("git", ["rev-parse", "--git-common-dir"]);
  if (gitDirRes.status !== 0 || commonDirRes.status !== 0) {
    throw new Error("Not inside a git repository.");
  }

  const gitDir = path.resolve(gitDirRes.stdout.trim());
  const commonDir = path.resolve(commonDirRes.stdout.trim());
  const isWorktree = gitDir !== commonDir;
  const mainRepoRoot = path.dirname(commonDir);

  const branchRes = runCapture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  const rawBranch = branchRes.status === 0 ? branchRes.stdout.trim() : "";
  const branchName =
    rawBranch && rawBranch !== "HEAD" ? rawBranch : path.basename(process.cwd());

  return { isWorktree, mainRepoRoot, branchName };
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function syncConvexSiteUrl(envLocalPath: string): {
  convexUrl?: string;
  convexSiteUrl?: string;
} {
  if (!existsSync(envLocalPath)) return {};

  const content = readFileSync(envLocalPath, "utf8");
  const lines = content.split(/\r?\n/);

  let convexUrl: string | undefined;
  for (const line of lines) {
    const match = line.match(/^NEXT_PUBLIC_CONVEX_URL=(.*)$/);
    if (match) {
      convexUrl = unquoteEnvValue(match[1]);
      break;
    }
  }

  if (!convexUrl || !convexUrl.includes(".convex.cloud")) {
    return { convexUrl };
  }

  const convexSiteUrl = convexUrl.replace(/\.convex\.cloud(\/?)$/, ".convex.site$1");
  let foundSiteUrl = false;
  const updated = lines.map((line) => {
    if (line.startsWith("NEXT_PUBLIC_CONVEX_SITE_URL=")) {
      foundSiteUrl = true;
      return `NEXT_PUBLIC_CONVEX_SITE_URL=${convexSiteUrl}`;
    }
    return line;
  });

  if (!foundSiteUrl) {
    const urlIdx = updated.findIndex((line) =>
      line.startsWith("NEXT_PUBLIC_CONVEX_URL="),
    );
    const insertAt = urlIdx >= 0 ? urlIdx + 1 : updated.length;
    updated.splice(insertAt, 0, `NEXT_PUBLIC_CONVEX_SITE_URL=${convexSiteUrl}`);
  }

  writeFileSync(envLocalPath, updated.join("\n"), "utf8");
  return { convexUrl, convexSiteUrl };
}

function bootstrapWorktree(mainRepoRoot: string, skipInstall: boolean) {
  const localEnvPath = path.resolve(".env.local");
  const mainEnvPath = path.join(mainRepoRoot, ".env.local");

  if (!existsSync(localEnvPath)) {
    if (existsSync(mainEnvPath)) {
      console.log(`Copying base .env.local from ${mainRepoRoot}...`);
      copyFileSync(mainEnvPath, localEnvPath);
    } else {
      throw new Error(
        `No .env.local found in current directory or ${mainRepoRoot}. Run \`bunx convex dev\` in the main checkout first.`,
      );
    }
  }

  if (!skipInstall && !existsSync(path.resolve("node_modules"))) {
    console.log("Installing dependencies with bun install...");
    runInherit("bun", ["install", "--frozen-lockfile"]);
  }
}

function createOrSelectDeployment(
  ref: string,
  expiration: string,
): { created: boolean } {
  console.log(`Creating Convex deployment "${ref}" (expiration: ${expiration})...`);
  const createRes = runConvexCapture([
    "deployment",
    "create",
    ref,
    "--type",
    "dev",
    "--select",
    "--expiration",
    expiration,
  ]);

  if (createRes.status === 0) {
    if (createRes.stdout.trim()) process.stdout.write(createRes.stdout);
    return { created: true };
  }

  const combined = `${createRes.stdout}\n${createRes.stderr}`;
  if (/already exists/i.test(combined)) {
    console.log(`Deployment "${ref}" already exists; selecting it...`);
    runConvexInherit(["deployment", "select", ref]);
    return { created: false };
  }

  if (createRes.stdout.trim()) process.stdout.write(createRes.stdout);
  if (createRes.stderr.trim()) process.stderr.write(createRes.stderr);
  throw new Error(`Failed to create deployment "${ref}".`);
}

function copyConvexEnvVars(source: string, target: string, tmpDir: string) {
  console.log(`Copying Convex env vars from "${source}" to "${target}"...`);
  const listRes = runConvexCapture(["env", "list", "--deployment", source]);
  if (listRes.status !== 0) {
    if (listRes.stderr.trim()) process.stderr.write(listRes.stderr);
    throw new Error(`Failed to list env vars from "${source}".`);
  }

  const envBody = listRes.stdout.trim();
  if (!envBody) {
    console.log(`No Convex env vars found on "${source}".`);
    return;
  }

  const envFile = path.join(tmpDir, "source.convex.env");
  writeFileSync(envFile, `${envBody}\n`, { mode: 0o600 });

  runConvexInherit([
    "env",
    "set",
    "--deployment",
    target,
    "--force",
    "--from-file",
    envFile,
  ]);
}

function cloneSnapshotData(
  source: string,
  target: string,
  includeFileStorage: boolean,
  tmpDir: string,
) {
  const snapshotPath = path.join(tmpDir, "snapshot.zip");
  const exportArgs = ["export", "--deployment", source];
  if (includeFileStorage) {
    exportArgs.push("--include-file-storage");
  }
  exportArgs.push("--path", snapshotPath);

  console.log(
    `Exporting snapshot from "${source}"${includeFileStorage ? " (with file storage)" : ""}...`,
  );
  runConvexInherit(exportArgs);

  console.log(`Importing snapshot into "${target}"...`);
  runConvexInherit([
    "import",
    snapshotPath,
    "--deployment",
    target,
    "--replace-all",
    "-y",
  ]);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const git = getGitContext();
  if (options.worktreeOnly && !git.isWorktree) {
    console.log(
      "Skipping Convex branch setup: current directory is the main checkout, not a worktree.",
    );
    return;
  }

  const targetRef = toBranchDeploymentRef(options.name ?? git.branchName);

  if (targetRef === options.source) {
    throw new Error(
      `Target deployment "${targetRef}" matches source "${options.source}". Pass --name <slug> to choose a different name.`,
    );
  }

  bootstrapWorktree(git.mainRepoRoot, options.skipInstall);

  const { created } = createOrSelectDeployment(targetRef, options.expiration);
  const { convexUrl, convexSiteUrl } = syncConvexSiteUrl(
    path.resolve(".env.local"),
  );

  const shouldSeed = created || options.reseed;
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "convex-branch-"));

  try {
    if (shouldSeed) {
      copyConvexEnvVars(options.source, targetRef, tmpDir);
    }

    if (shouldSeed && !options.skipData) {
      cloneSnapshotData(
        options.source,
        targetRef,
        options.includeFileStorage,
        tmpDir,
      );
    } else if (!created && !options.reseed) {
      console.log(
        `Kept existing data on "${targetRef}" (pass --reseed to overwrite from "${options.source}").`,
      );
    }

    if (!options.skipPush) {
      console.log(`Pushing Convex schema and functions to "${targetRef}"...`);
      runConvexInherit(["dev", "--once", "--env-file", ".env.local"]);
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("");
  console.log(`Convex branch ready: ${targetRef}`);
  if (convexUrl) console.log(`  NEXT_PUBLIC_CONVEX_URL:      ${convexUrl}`);
  if (convexSiteUrl)
    console.log(`  NEXT_PUBLIC_CONVEX_SITE_URL: ${convexSiteUrl}`);
  console.log("  Next: run `bunx convex dev` and `bun dev`");
}

try {
  main();
} catch (error) {
  console.error(
    error instanceof Error ? `Error: ${error.message}` : String(error),
  );
  process.exit(1);
}
