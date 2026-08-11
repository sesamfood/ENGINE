import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import {
  organizationAccessControl,
  organizationRoles,
} from "@/lib/auth-permissions";
import { usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    organizationClient({
      ac: organizationAccessControl,
      roles: organizationRoles,
      dynamicAccessControl: { enabled: true },
    }),
    convexClient(),
  ],
});
