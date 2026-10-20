"use client";

import { ArrowLeftIcon, Building2Icon, SettingsIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export type PlatformRole = "owner" | "support";

const PlatformRoleContext = createContext<PlatformRole>("support");

export function usePlatformRole() {
  return useContext(PlatformRoleContext);
}

export function PlatformShell({
  role,
  children,
}: {
  role: PlatformRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = [
    {
      href: "/platform",
      label: "Organisationer",
      icon: Building2Icon,
      active:
        pathname === "/platform" ||
        pathname.startsWith("/platform/organizations/"),
    },
    {
      href: "/platform/settings",
      label: "Indstillinger",
      icon: SettingsIcon,
      active: pathname.startsWith("/platform/settings"),
    },
  ];

  return (
    <PlatformRoleContext.Provider value={role}>
      <SidebarProvider>
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Platform</SidebarGroupLabel>
              <SidebarGroupContent>
                <nav aria-label="Platformnavigation">
                  <SidebarMenu appearance="spaced">
                    {items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          size="lg"
                          isActive={item.active}
                          render={
                            <Link
                              href={item.href}
                              aria-current={item.active ? "page" : undefined}
                            />
                          }
                        >
                          <item.icon aria-hidden="true" />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </nav>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg" render={<Link href="/profile" />}>
                  <ArrowLeftIcon aria-hidden="true" />
                  <span>Tilbage til appen</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4">
            <SidebarTrigger size="icon-lg" />
            <span className="font-semibold">Platformadministration</span>
          </header>
          <div className="flex-1 px-5 py-8 sm:px-8 lg:px-12">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </PlatformRoleContext.Provider>
  );
}
