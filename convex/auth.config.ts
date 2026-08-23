import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

const siteUrl = process.env.SITE_URL?.replace(/\/$/, "") ?? "";

export default {
  providers: [
    getAuthConfigProvider(),
    {
      type: "customJwt",
      issuer: `${siteUrl}/api/v1`,
      applicationID: "rest-api-v1",
      algorithm: "RS256",
      jwks: `${siteUrl}/.well-known/rest-api-jwks.json`,
    },
  ],
} satisfies AuthConfig;
