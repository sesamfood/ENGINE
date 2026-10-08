"use client";

import { useEffect } from "react";
import { authClient } from "@/lib/auth-client";
import { pageTitlePrefix } from "@/lib/page-title";

const DEFAULT_BROWSER_TITLE = `${pageTitlePrefix}SESAM ENGINE`;

export function BrowserBranding() {
  const { data: organization } = authClient.useActiveOrganization();

  useEffect(() => {
    const organizationName = organization?.name?.trim();
    document.title = organizationName
      ? `${pageTitlePrefix}${organizationName} | ENGINE`
      : DEFAULT_BROWSER_TITLE;

    return () => {
      document.title = DEFAULT_BROWSER_TITLE;
    };
  }, [organization?.name]);

  useEffect(() => {
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
  }, [organization?.logo]);

  return null;
}
