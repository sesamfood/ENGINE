import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  organizationRole: tables.organizationRole.index("organizationId_role", [
    "organizationId",
    "role",
  ]),
  session: tables.session.index("userId_expiresAt", ["userId", "expiresAt"]),
  member: tables.member
    .index("organizationId_userId", ["organizationId", "userId"])
    .index("organizationId_role", ["organizationId", "role"]),
  apikey: tables.apikey
    .index("configId", ["configId"])
    .index("referenceId", ["referenceId"])
    .index("key", ["key"]),
});

export default schema;
