"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";

const FALLBACK_SITE_NAME = "Driftsplatform";

export function BrowserBranding() {
  const { data: organization } = authClient.useActiveOrganization();

  useEffect(() => {
    document.title = organization?.name?.trim() || FALLBACK_SITE_NAME;

    const href = organization?.logo ?? "/favicon.ico";
    const icons = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]',
    );

    if (icons.length) {
      icons.forEach((icon) => {
        icon.href = href;
      });
      return;
    }

    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = href;
    document.head.append(icon);
  }, [organization?.logo, organization?.name]);

  return null;
}
