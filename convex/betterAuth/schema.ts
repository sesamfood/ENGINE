import { defineSchema } from "convex/server";
import { tables } from "./generatedSchema";

const schema = defineSchema({
  ...tables,
  session: tables.session.index("userId_expiresAt", ["userId", "expiresAt"]),
  member: tables.member
    .index("organizationId_userId", ["organizationId", "userId"])
    .index("organizationId_role", ["organizationId", "role"]),
});

export default schema;
