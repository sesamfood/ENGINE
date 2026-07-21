"use client";

import { useClerk, useOrganization, useUser } from "@clerk/nextjs";
import {
  CalendarDaysIcon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SettingsIcon,
  StoreIcon,
  UtensilsIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

const primaryNavigation = [
  { label: "Dashboard", href: "/", icon: LayoutDashboardIcon },
  { label: "Staff food", href: "/staff-food", icon: UtensilsIcon },
  { label: "Orders", href: "/orders", icon: ClipboardListIcon },
  { label: "History", href: "/history", icon: CalendarDaysIcon },
];

function OrganizationHome() {
  const { organization } = useOrganization();
  const logoUrl = organization?.imageUrl;

  return (
    <Link
      href="/"
      aria-label={organization ? `${organization.name} home` : "Home"}
      className="flex size-12 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {logoUrl ? (
        <span
          role="img"
          aria-label={organization?.name ?? "Organization"}
          className="size-11 rounded-xl bg-contain bg-center bg-no-repeat"
          style={{ backgroundImage: `url("${logoUrl}")` }}
        />
      ) : (
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <StoreIcon className="size-5" aria-hidden="true" />
        </span>
      )}
    </Link>
  );
}

function NavigationList() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <nav aria-label="Main navigation">
          <SidebarMenu>
            {primaryNavigation.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={active}
                    tooltip={item.label}
                    className="group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-3! group-data-[collapsible=icon]:[&_svg]:size-6"
                    render={
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      />
                    }
                  >
                    <Icon aria-hidden="true" />
                    <span className="group-data-[collapsible=icon]:hidden">
                      {item.label}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function AccountAvatar({
  imageUrl,
  name,
  initials,
  large = false,
  className,
}: {
  imageUrl?: string;
  name: string;
  initials: string;
  large?: boolean;
  className?: string;
}) {
  return (
    <Avatar size={large ? "lg" : "default"} className={className}>
      {imageUrl ? <AvatarImage src={imageUrl} alt={name} /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { signOut } = useClerk();
  const { isSignedIn, user } = useUser();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const displayName = user?.fullName || user?.firstName || "Profile";
  const email = user?.primaryEmailAddress?.emailAddress || "Account";
  const initials =
    [user?.firstName, user?.lastName]
      .filter((value): value is string => Boolean(value))
      .map((value) => value[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "P";
  const accountPageActive = pathname === "/profile" || pathname === "/settings";

  function goTo(href: string) {
    setOpenMobile(false);
    router.push(href);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          compact ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Open profile menu"
            />
          ) : (
            <SidebarMenuButton
              size="lg"
              isActive={accountPageActive}
              aria-label="Open profile menu"
              className="group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-1!"
            />
          )
        }
      >
        <AccountAvatar
          imageUrl={user?.imageUrl}
          name={displayName}
          initials={initials}
          className="group-data-[collapsible=icon]:size-10"
        />
        {!compact ? (
          <>
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate font-semibold">{displayName}</span>
              <span className="truncate text-xs text-muted-foreground">
                {email}
              </span>
            </div>
            <ChevronsUpDownIcon
              className="ml-auto group-data-[collapsible=icon]:hidden"
              aria-hidden="true"
            />
          </>
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={compact ? "bottom" : isMobile ? "top" : "right"}
        align="end"
        sideOffset={8}
        className="w-(--anchor-width) min-w-56"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-2">
            <div className="flex items-center gap-3">
              <AccountAvatar
                imageUrl={user?.imageUrl}
                name={displayName}
                initials={initials}
                large
              />
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{displayName}</span>
                <span className="truncate text-xs font-normal text-muted-foreground">
                  {email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => goTo("/profile")}>
            <UserRoundIcon />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => goTo("/settings")}>
            <SettingsIcon />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {isSignedIn ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  setOpenMobile(false);
                  void signOut({ redirectUrl: "/" });
                }}
              >
                <LogOutIcon />
                Log out
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "15.5rem",
            "--sidebar-width-icon": "4rem",
          } as CSSProperties
        }
      >
        <Sidebar collapsible="icon">
          <SidebarHeader className="h-24 items-center justify-center">
            <OrganizationHome />
          </SidebarHeader>

          <SidebarContent>
            <NavigationList />
          </SidebarContent>

          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <ProfileMenu />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 md:border-b-0">
            <SidebarTrigger size="icon-lg" />
            <div className="flex flex-1 justify-center md:hidden">
              <OrganizationHome />
            </div>
            <div className="md:hidden">
              <ProfileMenu compact />
            </div>
          </header>

          <div className="flex-1 px-5 py-8 sm:px-8 lg:px-12 lg:py-11">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
