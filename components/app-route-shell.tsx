"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { StoredOrganizationTheme } from "@/components/organization/organization-theme";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

const shelllessRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invitation",
  "/onboarding",
  "/share",
  "/help",
  "/platform",
];

// Only these may reuse the last organization's colors. Shared dashboards and
// invitations belong to another organization, and /platform to none.
const storedThemeRoutes = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/help",
];

function matchesRoute(routes: string[], pathname: string | null) {
  return Boolean(
    pathname &&
      routes.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`),
      ),
  );
}

const AuthenticatedAppShell = dynamic(
  () => import("./app-shell").then((module) => module.AppShell),
  {
    loading: () => (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Indlæser program"
      >
        <Spinner className="size-5" />
      </main>
    ),
  },
);

function AuthenticationRecovery() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void authClient.getSession({
      query: { disableCookieCache: true },
      fetchOptions: { timeout: 10_000 },
    }).then(({ data, error }) => {
      if (!active) return;
      if (error || data?.session) {
        setFailed(true);
        return;
      }
      const redirect = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [router]);

  return (
    <main className="grid min-h-screen place-items-center p-4" aria-busy={!failed}>
      {failed ? (
        <div className="flex w-full max-w-md flex-col gap-4">
          <Alert>
            <AlertTitle>Forbindelsen kunne ikke oprettes</AlertTitle>
            <AlertDescription>
              Kontrollér forbindelsen, og genindlæs siden for at prøve igen.
            </AlertDescription>
          </Alert>
          <Button type="button" size="lg" className="min-h-11 self-start" onClick={() => window.location.reload()}>
            Genindlæs siden
          </Button>
        </div>
      ) : <Spinner className="size-5" aria-label="Kontrollerer login" />}
    </main>
  );
}

export function AppRouteShell({
  children,
  defaultSidebarOpen,
}: {
  children: ReactNode;
  defaultSidebarOpen: boolean;
}) {
  const pathname = usePathname();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const shellless = matchesRoute(shelllessRoutes, pathname);
  const requiresAuth =
    !shellless ||
    pathname === "/onboarding" ||
    Boolean(pathname?.startsWith("/platform"));

  if (requiresAuth && !isLoading && !isAuthenticated) {
    return <AuthenticationRecovery />;
  }

  if (shellless) {
    return matchesRoute(storedThemeRoutes, pathname) ? (
      <StoredOrganizationTheme>{children}</StoredOrganizationTheme>
    ) : (
      children
    );
  }

  return (
    <AuthenticatedAppShell defaultSidebarOpen={defaultSidebarOpen}>
      {children}
    </AuthenticatedAppShell>
  );
}
