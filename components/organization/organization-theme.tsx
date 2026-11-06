"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, type ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { getOrganizationThemeCssVariables } from "@/convex/lib/organizationTheme";
import { useActiveOrganization } from "@/lib/active-organization";

const STORED_THEME_KEY = "engine.organization-theme";

function readStoredVariables(): Record<string, string> | null {
  try {
    const raw = window.localStorage.getItem(STORED_THEME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const entries = Object.entries(parsed).filter(
      (entry): entry is [string, string] =>
        entry[0].startsWith("--") && typeof entry[1] === "string",
    );
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    return null;
  }
}

/** Reuses the last signed-in organization's colors on signed-out routes. */
export function StoredOrganizationTheme({ children }: { children: ReactNode }) {
  useEffect(() => {
    const variables = readStoredVariables();
    if (!variables) return;
    const root = document.documentElement;
    const previous = new Map<string, string>();
    for (const [name, value] of Object.entries(variables)) {
      previous.set(name, root.style.getPropertyValue(name));
      root.style.setProperty(name, value);
    }
    return () => {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
    };
  }, []);

  return children;
}

export function OrganizationTheme({ children }: { children: ReactNode }) {
  const organization = useActiveOrganization();
  const { isAuthenticated } = useConvexAuth();
  const branding = useQuery(
    api.organization.getBranding,
    organization.data && isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (branding === undefined) return;
    if (!branding?.theme) {
      try {
        window.localStorage.removeItem(STORED_THEME_KEY);
      } catch {}
      return;
    }
    const root = document.documentElement;
    const variables = getOrganizationThemeCssVariables(branding.theme);
    try {
      window.localStorage.setItem(STORED_THEME_KEY, JSON.stringify(variables));
    } catch {}
    const previous = new Map<string, string>();
    for (const [name, value] of Object.entries(variables)) {
      previous.set(name, root.style.getPropertyValue(name));
      root.style.setProperty(name, value);
    }
    return () => {
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
    };
  }, [branding]);

  return children;
}
