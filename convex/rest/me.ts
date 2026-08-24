import { ConvexError, v } from "convex/values";
import { query } from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import { requireOrganization } from "../lib/auth";

type StoredOrganization = {
  id: string;
  name: string;
  slug: string;
};

export const get = query({
  args: {},
  returns: v.object({
    keyId: v.string(),
    organization: v.object({
      id: v.string(),
      name: v.string(),
      slug: v.string(),
    }),
    role: v.string(),
    permissions: v.array(v.string()),
    locationScope: v.object({
      all: v.boolean(),
      locationIds: v.array(v.id("locations")),
    }),
  }),
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
      throw new ConvexError({
        code: "invalid_api_identity",
        message: "This operation requires an API key.",
      });
    }
    const organization = await getDatabaseAdapter(ctx).findOne<StoredOrganization>({
      model: "organization",
      where: [{ field: "id", value: auth.organizationId }],
    });
    if (!organization) {
      throw new ConvexError({
        code: "invalid_api_key_policy",
        message: "The API key organization no longer exists.",
      });
    }
    return {
      keyId: auth.apiKeyId,
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      },
      role: auth.role,
      permissions: [...auth.permissions].sort(),
      locationScope: {
        all: auth.locationScope.all,
        locationIds: [...auth.locationScope.ids],
      },
    };
  },
});
