"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

export function OrganizationFavicon() {
  const { data: organization } = authClient.useActiveOrganization();
  const logo = organization?.logo;

  useEffect(() => {
    if (!logo) return;

    const link = document.createElement("link");
    link.rel = "icon";
    link.href = logo;
    document.head.append(link);

    return () => link.remove();
  }, [logo]);

  return null;
}
