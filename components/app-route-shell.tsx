"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
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

  if (isShelllessRoute(pathname)) return children;

  return (
    <AuthenticatedAppShell defaultSidebarOpen={defaultSidebarOpen}>
      {children}
    </AuthenticatedAppShell>
  );
}
