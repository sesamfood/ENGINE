"use client";

import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  Building2Icon,
  ChevronsUpDownIcon,
  ClipboardListIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  RefreshCwIcon,
  SettingsIcon,
  MonitorIcon,
  StoreIcon,
  Trash2Icon,
  UtensilsIcon,
  UsersRoundIcon,
  UserRoundIcon,
} from "lucide-react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Field,
  FieldContent,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
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
import { Switch } from "@/components/ui/switch";
import { BrowserBranding } from "@/components/browser-branding";
import { authClient } from "@/lib/auth-client";
import type { DataGranularity, PermissionId } from "@/lib/auth-permissions";
import { useCountLocation } from "@/lib/count-prefs";
import { useLastDefined } from "@/lib/use-last-defined";
import { cn } from "@/lib/utils";
import { getOrganizationThemeCssVariables } from "@/convex/lib/organizationTheme";
import { kioskDestination, type KioskDestinationId } from "@/lib/kiosk";
import { normalizeSidebarOrder } from "@/lib/sidebar-navigation";

const primaryNavigation = [
  { id: "dashboard", label: "Overblik", href: "/dashboard", icon: LayoutDashboardIcon, pages: [] },
  { id: "transfers", label: "Flytninger", href: "/transfers", icon: ArrowRightLeftIcon, pages: ["transfers.new", "transfers.history"] },
  { id: "waste", label: "Spild", href: "/waste", icon: Trash2Icon, pages: ["waste.register", "waste.badDelivery", "waste.report"] },
  { id: "staffFood", label: "Personalemad", href: "/staff-food", icon: UtensilsIcon, pages: ["staffFood.register"] },
  { id: "count", label: "Optælling", href: "/count", icon: ClipboardListIcon, pages: ["count.register", "count.stock"] },
];

const employeesNavigation = {
  id: "employees",
  label: "Medarbejdere",
  href: "/employees",
  icon: UsersRoundIcon,
  pages: ["employees.schedule", "employees.directory"],
};

const organizationNavigation = {
  id: "organization",
  label: "Organisation",
  href: "/organization",
  icon: Building2Icon,
  pages: [] as string[],
};

type KioskSettings = {
  enabledPages: string[];
  homePage: string | null;
  inactivitySeconds: number | null;
  updatedAt: number;
};

export type KioskRuntime = {
  isKioskAccount: boolean;
  kioskModeEnabled: boolean;
  locationId: Id<"locations"> | null;
  locationName: string | null;
  settings: KioskSettings | null;
};

type LocationOption = { id: Id<"locations">; name: string };

type AccessRuntime = {
  role: string;
  granularity: DataGranularity;
  permissions: string[];
  locationScope: { all: boolean; ids: Id<"locations">[] };
  kiosk: KioskRuntime | null;
};

type AccessContextValue = AccessRuntime & {
  locations: LocationOption[];
};

const AccessContext = createContext<AccessContextValue | null>(null);

const FeatureLockContext = createContext(false);
const ACTIVE_SYNC_INTERVAL_MS = 60 * 60 * 1_000;

function ActiveSyncHeartbeat() {
  const { isAuthenticated } = useConvexAuth();
  const organization = authClient.useActiveOrganization();
  const requestSync = useMutation(api.organization.requestActiveSync);
  const organizationId = organization.data?.id;

  useEffect(() => {
    if (!isAuthenticated || !organizationId) return;
    let lastRequestedAt = 0;
    const request = () => {
      const now = Date.now();
      if (
        document.visibilityState !== "visible" ||
        now - lastRequestedAt < ACTIVE_SYNC_INTERVAL_MS
      ) {
        return;
      }
      lastRequestedAt = now;
      void requestSync().catch(() => {
        lastRequestedAt = 0;
      });
    };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart",
      "focus",
    ];
    request();
    for (const event of events) {
      window.addEventListener(event, request, { passive: true });
    }
    document.addEventListener("visibilitychange", request);
    return () => {
      for (const event of events) {
        window.removeEventListener(event, request);
      }
      document.removeEventListener("visibilitychange", request);
    };
  }, [isAuthenticated, organizationId, requestSync]);

  return null;
}

const KIOSK_WAKE_LOCK_KEY = "engine.kiosk.keep-screen-on";

function useKioskWakeLock(enabled: boolean) {
  const supported = typeof navigator !== "undefined" && "wakeLock" in navigator;

  useEffect(() => {
    if (!enabled || !supported) return;
    let wakeLock: WakeLockSentinel | null = null;
    let pending = false;
    let cancelled = false;

    async function acquire() {
      if (
        pending ||
        document.visibilityState !== "visible" ||
        (wakeLock && !wakeLock.released)
      ) {
        return;
      }
      pending = true;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release();
        } else {
          wakeLock = lock;
        }
      } catch {
        wakeLock = null;
      } finally {
        pending = false;
      }
    }

    const handleVisibilityChange = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLock && !wakeLock.released) void wakeLock.release();
    };
  }, [enabled, supported]);

  return supported;
}

export function useAccess() {
  return useContext(AccessContext);
}

export function useKiosk() {
  return useContext(AccessContext)?.kiosk ?? null;
}

export function usePermission(permissionId: PermissionId) {
  const access = useContext(AccessContext);
  return Boolean(access?.permissions.includes(permissionId));
}

export function useLocationAccess() {
  const access = useContext(AccessContext);
  const locations = access?.locations ?? [];
  const kiosk = access?.kiosk;
  const kioskLocked = Boolean(kiosk?.isKioskAccount);
  const singleLocationLocked = locations?.length === 1;
  const isLocked = kioskLocked || singleLocationLocked;
  const lockedId = kioskLocked
    ? (kiosk?.locationId ?? null)
    : singleLocationLocked
      ? (locations?.[0]?.id ?? null)
      : null;
  const lockedName = kioskLocked
    ? (kiosk?.locationName ?? null)
    : singleLocationLocked
      ? (locations?.[0]?.name ?? null)
      : null;

  return {
    locations,
    isLocked,
    lockedId,
    lockedName,
  };
}

function effectiveKioskHome(runtime: KioskRuntime, countLocked: boolean) {
  if (countLocked) return "/count";
  const homePage = runtime.settings?.homePage as KioskDestinationId | undefined;
  return homePage ? kioskDestination(homePage).route : "/transfers";
}

function AccessBoundary({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const organization = authClient.useActiveOrganization();
  const access = useQuery(
    api.access.getContext,
    isAuthenticated && organization.data ? {} : "skip",
  );
  const locations = useQuery(
    api.locations.listLocationOptions,
    isAuthenticated && organization.data ? {} : "skip",
  );

  if (
    isAuthenticated &&
    organization.data &&
    (access === undefined || locations === undefined)
  ) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="Indlæser adgange">
        <Spinner className="size-5" />
      </main>
    );
  }

  const contextValue = access
    ? { ...access, locations: locations ?? [] }
    : null;
  return <AccessContext.Provider value={contextValue}>{children}</AccessContext.Provider>;
}

function KioskBehavior({ children }: { children: React.ReactNode }) {
  const runtime = useKiosk();
  const countLocked = useContext(FeatureLockContext);
  const pathname = usePathname();
  const router = useRouter();
  const home = runtime ? effectiveKioskHome(runtime, countLocked) : "/transfers";

  useEffect(() => {
    if (!runtime?.kioskModeEnabled || !runtime.settings) return;
    if (countLocked) {
      if (pathname !== "/count" && pathname !== "/waste") {
        router.replace("/count");
      }
      return;
    }
    const allowed = runtime.settings.enabledPages.some(
      (page) => kioskDestination(page as KioskDestinationId).route === pathname,
    );
    if (!allowed) router.replace(home);
  }, [countLocked, home, pathname, router, runtime]);

  useEffect(() => {
    const seconds = runtime?.kioskModeEnabled
      ? runtime.settings?.inactivitySeconds
      : null;
    if (!seconds || pathname === home) return;
    let timeout = window.setTimeout(() => window.location.replace(home), seconds * 1000);
    const activity = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => window.location.replace(home), seconds * 1000);
    };
    const visibility = () => {
      if (document.visibilityState === "visible") activity();
    };
    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "touchstart",
      "keydown",
      "scroll",
      "focus",
    ];
    for (const event of events) window.addEventListener(event, activity, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timeout);
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [home, pathname, runtime?.kioskModeEnabled, runtime?.settings?.inactivitySeconds, runtime?.settings?.updatedAt]);

  return children;
}

function featureLockExempt(pathname: string) {
  return (
    pathname === "/profile" ||
    pathname === "/settings" ||
    pathname === "/waste" ||
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
  const kiosk = useKiosk();
  const organization = authClient.useActiveOrganization();
  const [now, setNow] = useState(() => Date.now());
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const { locations } = useLocationAccess();
  const lockEnabled = useQuery(
    api.count.getOtherFeaturesLockEnabled,
    organizationId && isAuthenticated ? {} : "skip",
  );
  const locationId = kiosk?.isKioskAccount
    ? kiosk.locationId
    : locations?.some((location) => location.id === storedLocationId)
      ? (storedLocationId as Id<"locations">)
      : (locations?.[0]?.id ?? null);
  const lockState = useQuery(
    api.count.getOtherFeaturesLockState,
    organizationId && isAuthenticated && lockEnabled && locationId
      ? {
          locationId,
          now: Math.floor(now / 60_000) * 60_000,
        }
      : "skip",
  );
  const currentLockState = useLastDefined(
    lockState,
    organizationId && locationId ? `${organizationId}:${locationId}` : null,
  );
  const exempt = featureLockExempt(pathname);
  const isLocked = lockEnabled ? (currentLockState?.isLocked ?? false) : false;
  const lockReady =
    locations !== undefined &&
    lockEnabled !== undefined &&
    (!lockEnabled || !locationId || currentLockState !== undefined);

  useEffect(() => {
    if (!lockEnabled) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [lockEnabled]);

  useEffect(() => {
    if (isLocked && !exempt) router.replace("/count");
  }, [exempt, isLocked, router]);

  if (organizationId && isAuthenticated && !lockReady && !exempt) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Kontrollerer optællingsstatus"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  if (isLocked && !exempt) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Åbner optælling"
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
  const kiosk = useKiosk();
  const canDashboard = usePermission("dashboard.view");
  const canTransfersManage = usePermission("transfers.manage");
  const canTransfersView = usePermission("transfers.view");
  const canWasteRegister = usePermission("waste.register");
  const canWasteReport = usePermission("waste.report");
  const canStaffFood = usePermission("staffFood.register");
  const canCountRegister = usePermission("count.register");
  const canCountStock = usePermission("count.viewStock");
  const canEmployeesSchedule = usePermission("employees.schedule");
  const canEmployeesDirectory = usePermission("employees.directory");
  const canCatalog = usePermission("catalog.manage");
  const canLocations = usePermission("locations.manage");
  const canOrganizationSettings = usePermission("organization.settings");
  const canCountSettings = usePermission("count.settings");
  const canWasteSettings = usePermission("waste.settings");
  const canIntegrations = usePermission("integrations.manage");
  const canStaffFoodManage = usePermission("staffFood.manage");
  const canMembers = usePermission("members.manage");
  const canRoles = usePermission("roles.manage");
  const canOrganization =
    canCatalog ||
    canLocations ||
    canOrganizationSettings ||
    canCountSettings ||
    canWasteSettings ||
    canIntegrations ||
    canStaffFoodManage ||
    canMembers ||
    canRoles;
  const branding = useQuery(
    api.organization.getBranding,
    organization && isAuthenticated ? {} : "skip",
  );
  const logoUrl = organization?.logo;
  const wideLogoUrl = branding?.wideLogoUrl;
  const homeHref = kiosk?.kioskModeEnabled
    ? effectiveKioskHome(kiosk, featureLocked)
    : featureLocked
      ? "/count"
      : canDashboard
        ? "/dashboard"
        : canTransfersManage
          ? "/transfers"
          : canTransfersView
            ? "/transfers/history"
            : canWasteRegister
              ? "/waste"
              : canWasteReport
                ? "/waste/report"
            : canStaffFood
                ? "/staff-food"
                : canCountRegister
                  ? "/count"
                  : canCountStock
                    ? "/count/stock"
                    : canEmployeesSchedule
                      ? "/employees"
                      : canEmployeesDirectory
                        ? "/employees/directory"
                        : canOrganization
                          ? "/organization"
                          : "/profile";
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
  const organization = authClient.useActiveOrganization();
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const featureLocked = useContext(FeatureLockContext);
  const kiosk = useKiosk();
  const canDashboard = usePermission("dashboard.view");
  const canTransfersManage = usePermission("transfers.manage");
  const canTransfersView = usePermission("transfers.view");
  const canTransfers = canTransfersView || canTransfersManage;
  const canWasteRegister = usePermission("waste.register");
  const canWasteReport = usePermission("waste.report");
  const canWaste = canWasteRegister || canWasteReport;
  const canStaffFood = usePermission("staffFood.register");
  const canCountRegister = usePermission("count.register");
  const canCountStock = usePermission("count.viewStock");
  const canCount = canCountRegister || canCountStock;
  const canEmployeesSchedule = usePermission("employees.schedule");
  const canEmployeesDirectory = usePermission("employees.directory");
  const canEmployees = canEmployeesSchedule || canEmployeesDirectory;
  const canCatalog = usePermission("catalog.manage");
  const canLocations = usePermission("locations.manage");
  const canOrganizationSettings = usePermission("organization.settings");
  const canCountSettings = usePermission("count.settings");
  const canWasteSettings = usePermission("waste.settings");
  const canIntegrations = usePermission("integrations.manage");
  const canStaffFoodManage = usePermission("staffFood.manage");
  const canMembers = usePermission("members.manage");
  const canRoles = usePermission("roles.manage");
  const canOrganization =
    canCatalog ||
    canLocations ||
    canOrganizationSettings ||
    canCountSettings ||
    canWasteSettings ||
    canIntegrations ||
    canStaffFoodManage ||
    canMembers ||
    canRoles;
  const itemOrder = useQuery(
    api.navigation.getOrder,
    organization.data && isAuthenticated ? {} : "skip",
  );
  const allNavigation = [
    ...primaryNavigation,
    employeesNavigation,
    organizationNavigation,
  ];
  const orderedNavigation = normalizeSidebarOrder(itemOrder).flatMap((id) => {
    const item = allNavigation.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
  const operationalNavigation = orderedNavigation.filter(
    (item) => item.id !== "organization",
  );
  const kioskNavigation = kiosk?.kioskModeEnabled
    ? operationalNavigation.flatMap((item) => {
        if (featureLocked) {
          if (item.id === "count") return [{ ...item, href: "/count" }];
          if (item.id === "waste") return [{ ...item, href: "/waste" }];
          return [];
        }
        const first = item.pages.find((page) =>
          kiosk.settings?.enabledPages.includes(page),
        );
        return first
          ? [{ ...item, href: kioskDestination(first as KioskDestinationId).route }]
          : [];
      })
    : null;
  const navigation = kioskNavigation ?? orderedNavigation
    .filter((item) => {
      if (item.id === "dashboard") return canDashboard && !featureLocked;
      if (item.id === "transfers") return canTransfers && !featureLocked;
      if (item.id === "waste") return canWaste;
      if (item.id === "staffFood") return canStaffFood && !featureLocked;
      if (item.id === "count") return canCount;
      if (item.id === "employees") return canEmployees && !featureLocked;
      if (item.id === "organization") return canOrganization;
      return false;
    })
    .map((item) => {
      if (item.id === "transfers" && !canTransfersManage) {
        return { ...item, href: "/transfers/history" };
      }
      if (item.id === "waste" && !canWasteRegister) {
        return { ...item, href: "/waste/report" };
      }
      if (item.id === "count" && !canCountRegister) {
        return { ...item, href: "/count/stock" };
      }
      if (item.id === "employees" && !canEmployeesSchedule) {
        return { ...item, href: "/employees/directory" };
      }
      return item;
    });

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

function ProfileMenu({
  compact = false,
  signingOut,
  onSignOut,
}: {
  compact?: boolean;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const { data: session } = authClient.useSession();
  const kiosk = useKiosk();
  const canCatalog = usePermission("catalog.manage");
  const canLocations = usePermission("locations.manage");
  const canOrganizationSettings = usePermission("organization.settings");
  const canCountSettings = usePermission("count.settings");
  const canWasteSettings = usePermission("waste.settings");
  const canIntegrations = usePermission("integrations.manage");
  const canStaffFoodManage = usePermission("staffFood.manage");
  const canMembers = usePermission("members.manage");
  const canRoles = usePermission("roles.manage");
  const canManageOrganization =
    canCatalog ||
    canLocations ||
    canOrganizationSettings ||
    canCountSettings ||
    canWasteSettings ||
    canIntegrations ||
    canStaffFoodManage ||
    canMembers ||
    canRoles;
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const user = session?.user;
  const displayName = user?.name || "Profil";
  const email = kiosk?.isKioskAccount
    ? ((user as typeof user & { displayUsername?: string | null; username?: string | null })
        ?.displayUsername ??
      (user as typeof user & { username?: string | null })?.username ??
      "Kioskkonto")
    : user?.email || "Konto";
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
                disabled={signingOut}
                onClick={() => {
                  setOpenMobile(false);
                  onSignOut();
                }}
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

function KioskModeControl() {
  const kiosk = useKiosk();
  const countLocked = useContext(FeatureLockContext);
  const { state } = useSidebar();
  const router = useRouter();
  const setMode = useMutation(api.kiosk.setMode);
  const [pending, setPending] = useState(false);
  const [keepScreenOn, setKeepScreenOn] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(KIOSK_WAKE_LOCK_KEY) !== "false";
    } catch {
      return true;
    }
  });
  const wakeLockSupported = useKioskWakeLock(
    Boolean(kiosk?.kioskModeEnabled && keepScreenOn),
  );

  if (!kiosk?.isKioskAccount || state !== "expanded") return null;

  function changeKeepScreenOn(checked: boolean) {
    setKeepScreenOn(checked);
    try {
      window.localStorage.setItem(KIOSK_WAKE_LOCK_KEY, String(checked));
    } catch {}
  }

  async function change(enabled: boolean) {
    if (!kiosk) return;
    setPending(true);
    try {
      await setMode({ enabled });
      if (enabled) router.replace(effectiveKioskHome(kiosk, countLocked));
      router.refresh();
    } catch {
      toast.error("Kiosktilstanden kunne ikke ændres");
    } finally {
      setPending(false);
    }
  }

  if (!kiosk.kioskModeEnabled) {
    return (
      <Button type="button" variant="outline" className="w-full" disabled={pending} onClick={() => void change(true)}>
        {pending ? <Spinner data-icon="inline-start" /> : <MonitorIcon data-icon="inline-start" />}
        Aktivér kiosktilstand
      </Button>
    );
  }

  return (
    <>
      <FieldLabel htmlFor="kiosk-wake-lock">
        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Hold skærmen tændt</FieldTitle>
          </FieldContent>
          <Switch
            id="kiosk-wake-lock"
            checked={keepScreenOn}
            disabled={!wakeLockSupported}
            onCheckedChange={changeKeepScreenOn}
          />
        </Field>
      </FieldLabel>
      <AlertDialog>
        <AlertDialogTrigger render={<Button type="button" variant="outline" className="w-full" disabled={pending} />}>
          <MonitorIcon data-icon="inline-start" />
          Deaktivér kiosktilstand
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deaktivér kiosktilstand?</AlertDialogTitle>
            <AlertDialogDescription>Du får den normale brugerflade med de adgange, kontoens rolle tillader.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="default">Behold kiosktilstand</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void change(false)}>Deaktivér kiosktilstand</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SidebarAccount({ signingOut, onSignOut }: { signingOut: boolean; onSignOut: () => void }) {
  const kiosk = useKiosk();
  return (
    <SidebarFooter>
      <KioskModeControl />
      {!kiosk?.kioskModeEnabled ? (
        <SidebarMenu><SidebarMenuItem><ProfileMenu signingOut={signingOut} onSignOut={onSignOut} /></SidebarMenuItem></SidebarMenu>
      ) : null}
    </SidebarFooter>
  );
}

function MobileAccount({ signingOut, onSignOut }: { signingOut: boolean; onSignOut: () => void }) {
  const kiosk = useKiosk();
  return kiosk?.kioskModeEnabled ? null : <ProfileMenu compact signingOut={signingOut} onSignOut={onSignOut} />;
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
          <AlertTitle>Siden kunne ikke indlæses</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            Genindlæs siden, og prøv igen.
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              <RefreshCwIcon data-icon="inline-start" />
              Genindlæs siden
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

function OrganizationTheme({ children }: { children: React.ReactNode }) {
  const organization = authClient.useActiveOrganization();
  const { isAuthenticated } = useConvexAuth();
  const branding = useQuery(
    api.organization.getBranding,
    organization.data && isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (!branding?.theme) return;
    const root = document.documentElement;
    const variables = getOrganizationThemeCssVariables(branding.theme);
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
  }, [branding?.theme]);

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
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!signingOut) return;

    let cancelled = false;
    void authClient
      .signOut()
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setSigningOut(false);
          toast.error("Du kunne ikke logges ud");
          return;
        }
        router.replace("/login");
        router.refresh();
      })
      .catch(() => {
        if (cancelled) return;
        setSigningOut(false);
        toast.error("Du kunne ikke logges ud. Kontrollér forbindelsen");
      });

    return () => {
      cancelled = true;
    };
  }, [router, signingOut]);

  const shellless = [
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
    "/invitation",
    "/onboarding",
    "/share",
  ].some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (shellless) return children;

  const organizationRequired =
    pathname !== "/profile" && pathname !== "/settings";
  const showOrganizationBack =
    pathname.startsWith("/organization/") &&
    !pathname.startsWith("/organization/products/");
  const showCountHeader =
    pathname === "/count" || pathname.startsWith("/count/");
  const showWasteHeader =
    pathname === "/waste" || pathname.startsWith("/waste/");
  const showStaffFoodHeader = pathname === "/staff-food";
  const showEmployeesHeader = pathname === "/employees" || pathname.startsWith("/employees/");
  const showTransfersHeader = pathname === "/transfers" || pathname.startsWith("/transfers/");
  const showDashboardHeader = pathname === "/dashboard";
  const showOrganizationHeader =
    pathname === "/organization" || pathname.startsWith("/organization/");
  const showPageHeader =
    showCountHeader ||
    showWasteHeader ||
    showStaffFoodHeader ||
    showEmployeesHeader ||
    showTransfersHeader ||
    showDashboardHeader ||
    showOrganizationHeader;

  if (signingOut) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Logger ud"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  return (
    <>
      <BrowserBranding />
      <OrganizationBoundary required={organizationRequired}>
      <ActiveSyncHeartbeat />
      <OrganizationTheme>
        <AccessBoundary>
          <FeatureLockBoundary>
            <KioskBehavior>
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

            <SidebarAccount signingOut={signingOut} onSignOut={() => setSigningOut(true)} />
          </Sidebar>

          <SidebarInset className="min-w-0">
            <header
              className={cn(
                "sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 md:border-b-0",
                showPageHeader && "md:h-24 md:pr-8 md:pl-4 lg:pr-12",
              )}
            >
              <SidebarTrigger size="icon-lg" />
              {showPageHeader ? (
                <div
                  id={
                    showCountHeader
                      ? "count-shell-header"
                      : showWasteHeader
                        ? "waste-shell-header"
                        : showStaffFoodHeader
                          ? "staff-food-shell-header"
                          : showEmployeesHeader
                            ? "employees-shell-header"
                            : showTransfersHeader
                              ? "transfers-shell-header"
                              : showDashboardHeader
                                ? "dashboard-shell-header"
                              : "organization-shell-header"
                  }
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
                <MobileAccount signingOut={signingOut} onSignOut={() => setSigningOut(true)} />
              </div>
            </header>

            <div
              className={cn(
                "flex-1",
                showPageHeader
                  ? "p-4"
                  : "px-5 py-8 sm:px-8 lg:px-12 lg:py-11",
              )}
            >
              {children}
            </div>
          </SidebarInset>
          </SidebarProvider>
            </KioskBehavior>
        </FeatureLockBoundary>
        </AccessBoundary>
      </OrganizationTheme>
      </OrganizationBoundary>
    </>
  );
}
