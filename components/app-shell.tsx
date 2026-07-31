"use client";

import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  Building2Icon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  LogOutIcon,
  SettingsIcon,
  StoreIcon,
  UsersRoundIcon,
  UserRoundIcon,
} from "lucide-react";
import { useConvexAuth, useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { canManageCatalog } from "@/lib/auth-permissions";
import { useCountLocation } from "@/lib/count-prefs";
import { cn } from "@/lib/utils";

const primaryNavigation = [
  { label: "Transfers", href: "/transfers", icon: ArrowRightLeftIcon },
  { label: "Count", href: "/count", icon: ClipboardListIcon },
];

const employeesNavigation = {
  label: "Medarbejdere",
  href: "/employees",
  icon: UsersRoundIcon,
};

const organizationNavigation = {
  label: "Organisation",
  href: "/organization",
  icon: Building2Icon,
};

const FeatureLockContext = createContext(false);

function featureLockExempt(pathname: string) {
  return (
    pathname === "/profile" ||
    pathname === "/settings" ||
    pathname === "/count" ||
    pathname.startsWith("/count/") ||
    pathname === "/organization" ||
    pathname.startsWith("/organization/")
  );
}

function FeatureLockBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const organization = authClient.useActiveOrganization();
  const [now, setNow] = useState(() => Date.now());
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const locations = useQuery(
    api.locations.listLocationOptions,
    organizationId && isAuthenticated ? {} : "skip",
  );
  const locationId = locations?.some(
    (location) => location.id === storedLocationId,
  )
    ? (storedLocationId as Id<"locations">)
    : (locations?.[0]?.id ?? null);
  const lockState = useQuery(
    api.count.getOtherFeaturesLockState,
    organizationId && isAuthenticated && locationId
      ? {
          locationId,
          now: Math.floor(now / 60_000) * 60_000,
        }
      : "skip",
  );
  const exempt = featureLockExempt(pathname);
  const isLocked = lockState?.isLocked ?? false;
  const lockReady =
    locations !== undefined && (!locationId || lockState !== undefined);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isLocked && !exempt) router.replace("/count");
  }, [exempt, isLocked, router]);

  if (organizationId && isAuthenticated && !lockReady && !exempt) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Kontrollerer count-status"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  if (isLocked && !exempt) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Åbner count"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  return (
    <FeatureLockContext.Provider value={isLocked}>
      {children}
    </FeatureLockContext.Provider>
  );
}

function OrganizationHome() {
  const { data: organization } = authClient.useActiveOrganization();
  const { state, isMobile } = useSidebar();
  const { isAuthenticated } = useConvexAuth();
  const featureLocked = useContext(FeatureLockContext);
  const branding = useQuery(
    api.organization.getBranding,
    organization && isAuthenticated ? {} : "skip",
  );
  const logoUrl = organization?.logo;
  const wideLogoUrl = branding?.wideLogoUrl;
  const homeHref = featureLocked ? "/count" : "/transfers";
  const showWideLogo = state === "expanded" || isMobile;

  if (showWideLogo && branding === undefined) {
    return <div className="h-12 w-full" />;
  }

  if (wideLogoUrl && showWideLogo) {
    return (
      <Link
        href={homeHref}
        aria-label={`${organization?.name ?? "Organisation"} startside`}
        className="flex h-12 w-full min-w-0 items-center justify-center px-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Image
          src={wideLogoUrl}
          alt={organization?.name ?? "Organisation"}
          width={200}
          height={48}
          unoptimized
          className="max-h-10 w-auto max-w-full object-contain"
        />
      </Link>
    );
  }

  return (
    <Link
      href={homeHref}
      aria-label={organization ? `${organization.name} startside` : "Startside"}
      className="flex size-12 items-center justify-center focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div
        className={cn(
          "relative flex size-11 overflow-hidden",
          !logoUrl && "bg-primary text-primary-foreground",
        )}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={organization?.name ?? "Organisation"}
            fill
            unoptimized
            className="object-cover"
          />
        ) : (
          <span className="flex size-full items-center justify-center">
            <StoreIcon className="size-5" aria-hidden="true" />
          </span>
        )}
      </div>
    </Link>
  );
}

function NavigationList() {
  const { data: membership } = authClient.useActiveMemberRole();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const featureLocked = useContext(FeatureLockContext);
  const primaryWithEmployees = [...primaryNavigation, employeesNavigation];
  const availableNavigation = featureLocked
    ? primaryWithEmployees.filter((item) => item.href === "/count")
    : primaryWithEmployees;
  const navigation = canManageCatalog(membership?.role)
    ? [...availableNavigation, organizationNavigation]
    : availableNavigation;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <nav aria-label="Primær navigation">
          <SidebarMenu className="gap-2">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active =
                item === organizationNavigation
                  ? pathname.startsWith("/organization")
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);

              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={active}
                    tooltip={item.label}
                    className="text-base [&_svg]:size-4 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0! group-data-[collapsible=icon]:[&_svg]:size-4"
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
  const { data: session } = authClient.useSession();
  const { data: membership } = authClient.useActiveMemberRole();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const user = session?.user;
  const displayName = user?.name || "Profil";
  const email = user?.email || "Konto";
  const initials =
    displayName
      .split(/\s+/)
      .map((value) => value[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "P";
  const accountPageActive =
    pathname === "/profile" ||
    pathname === "/settings" ||
    pathname.startsWith("/organization");
  const canManageOrganization = canManageCatalog(membership?.role);

  function goTo(href: string) {
    setOpenMobile(false);
    router.push(href);
  }

  async function signOut() {
    setOpenMobile(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        toast.error("Du kunne ikke logges ud");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Du kunne ikke logges ud. Kontrollér forbindelsen");
    }
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
              aria-label="Åbn profilmenu"
            />
          ) : (
            <SidebarMenuButton
              size="lg"
              isActive={accountPageActive}
              aria-label="Åbn profilmenu"
              className="group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-1!"
            />
          )
        }
      >
        <AccountAvatar
          imageUrl={user?.image ?? undefined}
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
                imageUrl={user?.image ?? undefined}
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
            Profil
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => goTo("/settings")}>
            <SettingsIcon />
            Indstillinger
          </DropdownMenuItem>
          {canManageOrganization ? (
            <DropdownMenuItem onClick={() => goTo("/organization")}>
              <Building2Icon />
              Organisation
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {session ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => void signOut()}
              >
                <LogOutIcon />
                Log ud
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function OrganizationBoundary({
  children,
  required,
}: {
  children: React.ReactNode;
  required: boolean;
}) {
  const router = useRouter();
  const organizations = authClient.useListOrganizations();
  const activeOrganization = authClient.useActiveOrganization();
  const [activationError, setActivationError] = useState(false);
  const activeOrganizationId = activeOrganization.data?.id;
  const firstOrganizationId = organizations.data?.[0]?.id;

  useEffect(() => {
    if (!required) return;
    if (organizations.isPending || activeOrganization.isPending) return;
    if (organizations.error || activeOrganization.error) return;
    if (activeOrganizationId) return;

    if (!firstOrganizationId) {
      router.replace("/onboarding");
      return;
    }

    void authClient.organization
      .setActive({ organizationId: firstOrganizationId })
      .then(({ error }) => {
        if (error) {
          setActivationError(true);
          return;
        }
        setActivationError(false);
        router.refresh();
      })
      .catch(() => setActivationError(true));
  }, [
    activeOrganization.isPending,
    activeOrganization.error,
    activeOrganizationId,
    firstOrganizationId,
    organizations.isPending,
    organizations.error,
    required,
    router,
  ]);

  if (!required) return children;

  if (organizations.error || activeOrganization.error || activationError) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Organisationen kunne ikke indlæses</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            Kontrollér forbindelsen, og prøv igen.
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setActivationError(false);
                void organizations.refetch();
                void activeOrganization.refetch();
              }}
            >
              Prøv igen
            </Button>
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  if (
    organizations.isPending ||
    activeOrganization.isPending ||
    !activeOrganizationId
  ) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Indlæser organisation"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  return children;
}

export function AppShell({
  children,
  defaultSidebarOpen,
}: {
  children: React.ReactNode;
  defaultSidebarOpen: boolean;
}) {
  const pathname = usePathname();
  const shellless = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/invitation",
    "/onboarding",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (shellless) return children;

  const organizationRequired =
    pathname !== "/profile" && pathname !== "/settings";
  const showOrganizationBack =
    pathname.startsWith("/organization/") &&
    !pathname.startsWith("/organization/products/");
  const showCountHeader =
    pathname === "/count" || pathname.startsWith("/count/");

  return (
    <OrganizationBoundary required={organizationRequired}>
      <FeatureLockBoundary>
        <SidebarProvider
          defaultOpen={defaultSidebarOpen}
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
            <header
              className={cn(
                "sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 md:border-b-0",
                showCountHeader && "md:h-24 md:pr-8 md:pl-4 lg:pr-12",
              )}
            >
              <SidebarTrigger size="icon-lg" />
              {showCountHeader ? (
                <div
                  id="count-shell-header"
                  className="hidden min-w-0 flex-1 md:block"
                />
              ) : null}
              {showOrganizationBack ? (
                <Button
                  variant="outline"
                  size="lg"
                  render={<Link href="/organization" />}
                  nativeButton={false}
                >
                  <ArrowLeftIcon data-icon="inline-start" />
                  <span className="hidden sm:inline">
                    Tilbage til organisation
                  </span>
                  <span className="sm:hidden">Tilbage</span>
                </Button>
              ) : null}
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
      </FeatureLockBoundary>
    </OrganizationBoundary>
  );
}
