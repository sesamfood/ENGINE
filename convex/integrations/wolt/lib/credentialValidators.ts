import { v } from "convex/values";

export const woltEnvironmentValidator = v.union(
  v.literal("development"),
  v.literal("production"),
);

export const woltStoredCredentialsValidator = v.object({
  environment: woltEnvironmentValidator,
  clientId: v.string(),
  clientSecretCiphertext: v.string(),
  webhookSecretCiphertext: v.string(),
  wioApiKeyCiphertext: v.optional(v.string()),
  wioRedirectUris: v.array(v.string()),
});

export const woltCredentialsValidator = v.object({
  environment: woltEnvironmentValidator,
  clientId: v.string(),
  clientSecret: v.string(),
  webhookSecret: v.string(),
  wioApiKey: v.union(v.string(), v.null()),
  wioRedirectUris: v.array(v.string()),
});
