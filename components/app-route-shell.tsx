"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { Spinner } from "@/components/ui/spinner";

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
];

function isShelllessRoute(pathname: string | null) {
  return Boolean(
    pathname &&
      shelllessRoutes.some(
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

export function AppRouteShell({
  children,
  defaultSidebarOpen,
}: {
  children: ReactNode;
  defaultSidebarOpen: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const shellless = isShelllessRoute(pathname);
  const requiresAuth = !shellless || pathname === "/onboarding";

  useEffect(() => {
    if (!requiresAuth || isLoading || isAuthenticated) return;
    const redirect = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?redirect=${encodeURIComponent(redirect)}`);
  }, [requiresAuth, isLoading, isAuthenticated, router]);

  if (requiresAuth && !isLoading && !isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="Indlæser program">
        <Spinner className="size-5" />
      </main>
    );
  }

  if (shellless) return children;

  return (
    <AuthenticatedAppShell defaultSidebarOpen={defaultSidebarOpen}>
      {children}
    </AuthenticatedAppShell>
  );
}
