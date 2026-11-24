export const PROTECTED_BRANCHES = new Set([
  "main",
  "master",
  "dev",
  "develop",
  "staging",
  "production",
]);

export function sanitizeBranchSlug(raw: string): string {
  const stripped = raw
    .trim()
    .replace(/^dev\//i, "")
    .replace(/^(t3code|t3)\//i, "");
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48)
    .replace(/-$/, "");

  if (!slug) {
    throw new Error(`Could not derive a valid deployment name from "${raw}".`);
  }
  return slug;
}

export function toBranchDeploymentRef(raw: string): string {
  return `dev/${sanitizeBranchSlug(raw)}`;
}
