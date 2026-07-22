import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import {
  organizationAccessControl,
  organizationRoles,
} from "@/lib/auth-permissions";

export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac: organizationAccessControl,
      roles: organizationRoles,
    }),
    convexClient(),
  ],
});
