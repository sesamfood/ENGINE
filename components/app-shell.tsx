"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  Building2Icon,
  ChevronsUpDownIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FlaskConicalIcon,
  CircleHelpIcon,
  CircleOffIcon,
  ListChecksIcon,
  LogOutIcon,
  MoonIcon,
  LayoutDashboardIcon,
  LifeBuoyIcon,
  ReceiptTextIcon,
  WalletIcon,
  RefreshCwIcon,
  SettingsIcon,
  MonitorIcon,
  PackageCheckIcon,
  PrinterIcon,
  StoreIcon,
  Trash2Icon,
  UtensilsIcon,
  UsersRoundIcon,
  UserRoundIcon,
  ShieldIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { toast } from "sonner";
import posthog from "posthog-js";
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
  AlertDialogMedia,
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
import {
  AppPageHeaderProvider,
  AppPageHeaderTarget,
} from "@/components/app-page-header";
import { BrowserBranding } from "@/components/browser-branding";
import { FeedbackDialog } from "@/components/feedback/feedback-dialog";
import { authClient } from "@/lib/auth-client";
import type { DataGranularity, PermissionId } from "@/lib/auth-permissions";
import { useCountLocation } from "@/lib/count-prefs";
import { useLastDefined } from "@/lib/use-last-defined";
import { getUserErrorMessage } from "@/lib/user-errors";
import { cn } from "@/lib/utils";
import { featureForPath, featureLabels, type FeatureId } from "@/lib/features";
import { getOrganizationThemeCssVariables } from "@/convex/lib/organizationTheme";
import { kioskDestinationMatches } from "@/lib/kiosk";
import type { KioskDayTask } from "@/lib/kiosk-day";
import {
  normalizeSidebarOrder,
  type SidebarItemId,
} from "@/lib/sidebar-navigation";
import {
  canOpenAdministration,
  homeDestination,
  kioskHome,
  resolveAppNavigation,
} from "@/lib/app-navigation";
import {
  useActiveOrganization,
  useSupportSession,
} from "@/lib/active-organization";

const navigationIcons = {
  dashboard: LayoutDashboardIcon,
  dateLabels: PrinterIcon,
  woltOrders: ShoppingBagIcon,
  ordering: ShoppingCartIcon,
  transfers: ArrowRightLeftIcon,
  invoices: ReceiptTextIcon,
  expenses: WalletIcon,
  goodsReceipts: PackageCheckIcon,
  waste: Trash2Icon,
  ownChecks: ClipboardCheckIcon,
  staffFood: UtensilsIcon,
  count: ClipboardListIcon,
  employees: UsersRoundIcon,
  organization: SettingsIcon,
} satisfies Record<SidebarItemId, typeof LayoutDashboardIcon>;

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
  disabledFeatures: FeatureId[];
  nonEntitledFeatures: FeatureId[];
  hideUnavailable: boolean;
  locationScope: { all: boolean; ids: Id<"locations">[] };
  kiosk: KioskRuntime | null;
};

type AccessContextValue = AccessRuntime & {
  locations: LocationOption[];
  woltEnabled: boolean | undefined;
};

const AccessContext = createContext<AccessContextValue | null>(null);

const FeatureLockContext = createContext(false);

type KioskDayState = {
  phase: "endOfDay" | "startOfDay" | null;
  tasks: KioskDayTask[];
  scheduledAt: number | null;
  timeZone: string | null;
  endOfDayDismissed: boolean;
  dismissEndOfDay: () => void;
};

const KioskDayContext = createContext<KioskDayState | null>(null);

export const KIOSK_DAY_PATH = "/day-tasks";
const END_OF_DAY_DISMISSED_KEY = "engine.kiosk-day.dismissed";

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

export function useKioskDay() {
  return useContext(KioskDayContext);
}

// True on a page linked from a task in the current day phase.
function useOnLinkedDayTaskPage() {
  const day = useKioskDay();
  const pathname = usePathname();
  return Boolean(
    day?.phase &&
      day.tasks.some((task) => task.link && kioskDestinationMatches(task.link, pathname)),
  );
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

// Identifies every session, not only fresh logins, so replays, errors and
// feedback can be traced to a user, organization and location.
function AnalyticsIdentity() {
  const { data: session } = authClient.useSession();
  const { data: organization } = useActiveOrganization();
  const access = useAccess();
  const { lockedId, lockedName } = useLocationAccess();
  const userId = session?.user.id;
  const name = session?.user.name;
  const email = session?.user.email;
  const organizationId = organization?.id;
  const organizationName = organization?.name;
  const role = access?.role;
  const kiosk = Boolean(access?.kiosk?.isKioskAccount);

  useEffect(() => {
    if (!userId || !organizationId || !role) return;
    posthog.identify(userId, { name, email, role, kiosk });
    posthog.group("organization", organizationId, { name: organizationName });
    posthog.register({
      organization_id: organizationId,
      organization_name: organizationName,
      role,
      location_id: lockedId,
      location_name: lockedName,
    });
  }, [userId, name, email, organizationId, organizationName, role, kiosk, lockedId, lockedName]);

  return null;
}

function useAppNavigation() {
  const access = useAccess();
  const countLocked = useContext(FeatureLockContext);
  const canWolt = Boolean(access?.permissions.includes("sales.viewDetail"));
  const navigation = resolveAppNavigation({
    permissions: access?.permissions ?? [],
    kiosk: access?.kiosk ?? null,
    countLocked,
    woltEnabled: access?.woltEnabled === true,
    disabledFeatures: access?.disabledFeatures,
  });
  return {
    navigation,
    ready: access !== null && (!canWolt || access.woltEnabled !== undefined),
  };
}

export function useHomeDestination() {
  const access = useAccess();
  const kiosk = useKiosk();
  const countLocked = useContext(FeatureLockContext);
  const { navigation, ready } = useAppNavigation();
  if (!ready) return null;
  if (countLocked) return "/count";
  return kiosk?.kioskModeEnabled
    ? kioskHome(kiosk, countLocked, access?.disabledFeatures)
    : homeDestination(navigation);
}

function AccessBoundary({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const organization = useActiveOrganization();
  const runtime = useQuery(
    api.access.getRuntimeContext,
    isAuthenticated && organization.data ? {} : "skip",
  );
  const integrations = useIntegrations();
  const woltEnabled = integrations?.wolt;

  if (isLoading || (organization.data && runtime === undefined)) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Indlæser adgange"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  const contextValue = runtime
    ? { ...runtime, woltEnabled }
    : null;
  return (
    <AccessContext.Provider value={contextValue}>
      {children}
    </AccessContext.Provider>
  );
}

function useCurrentFeatureState() {
  const access = useAccess();
  const pathname = usePathname();
  const integrations = useIntegrations();
  const provider = pathname === "/administration/menus" ? "onlinepos"
    : pathname === "/administration/wolt-orders" || pathname.startsWith("/wolt-orders") ? "wolt"
    : undefined;
  const woltSettings = pathname === "/administration/wolt-orders";
  const feature = woltSettings ? "woltOrders" : featureForPath(pathname);
  return {
    feature,
    disabled: Boolean(
      (provider && integrations?.[provider] === false) ||
      feature &&
        ((!woltSettings && access?.disabledFeatures.includes(feature)) ||
          (feature === "woltOrders" && access?.woltEnabled === false)),
    ),
    pending: Boolean(
      (provider && integrations === undefined) ||
      feature &&
        (!access ||
          (feature === "woltOrders" && access.woltEnabled === undefined)),
    ),
  };
}

function FeatureRouteBoundary({ children }: { children: React.ReactNode }) {
  const { feature, disabled, pending } = useCurrentFeatureState();
  if (pending) {
    return (
      <main
        className="grid min-h-64 place-items-center"
        aria-label="Indlæser funktion"
      >
        <Spinner className="size-5" />
      </main>
    );
  }
  if (disabled) {
    return (
      <main className="flex min-h-64 items-center">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CircleOffIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>
              <h1>{feature && feature !== "woltOrders" ? `${featureLabels[feature]} er slået fra` : "Siden er ikke tilgængelig"}</h1>
            </EmptyTitle>
            <EmptyDescription>
              Kontakt en Administrator for at få funktionen aktiveret.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }
  return children;
}

function KioskBehavior({ children }: { children: React.ReactNode }) {
  const runtime = useKiosk();
  const countLocked = useContext(FeatureLockContext);
  const pathname = usePathname();
  const router = useRouter();
  const home = useHomeDestination();
  const { disabled, pending } = useCurrentFeatureState();
  const dayPhase = useKioskDay()?.phase;
  const onDayTasks = pathname === KIOSK_DAY_PATH && Boolean(dayPhase);

  useEffect(() => {
    if (
      onDayTasks ||
      !runtime?.kioskModeEnabled ||
      !runtime.settings ||
      !home ||
      disabled ||
      pending
    )
      return;
    if (countLocked) {
      if (pathname !== "/count" && pathname !== "/waste") {
        router.replace("/count");
      }
      return;
    }
    const allowed = runtime.settings.enabledPages.some((page) =>
      kioskDestinationMatches(page, pathname),
    );
    if (!allowed && pathname !== home) router.replace(home);
  }, [countLocked, disabled, home, onDayTasks, pathname, pending, router, runtime]);

  useEffect(() => {
    const seconds = runtime?.kioskModeEnabled
      ? runtime.settings?.inactivitySeconds
      : null;
    if (!seconds || !home || pathname === home || onDayTasks || disabled || pending) {
      return;
    }
    let timeout = window.setTimeout(
      () => window.location.replace(home),
      seconds * 1000,
    );
    const activity = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => window.location.replace(home),
        seconds * 1000,
      );
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
    for (const event of events)
      window.addEventListener(event, activity, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearTimeout(timeout);
      for (const event of events) window.removeEventListener(event, activity);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [
    disabled,
    home,
    onDayTasks,
    pathname,
    pending,
    runtime?.kioskModeEnabled,
    runtime?.settings?.inactivitySeconds,
    runtime?.settings?.updatedAt,
  ]);

  return children;
}

function featureLockExempt(pathname: string) {
  return (
    pathname === "/profile" ||
    pathname === "/waste" ||
    pathname === "/count" ||
    pathname.startsWith("/count/") ||
    pathname === "/administration" ||
    pathname.startsWith("/administration/")
  );
}

function minuteTimestamp() {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

function FeatureLockBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const kiosk = useKiosk();
  const access = useAccess();
  const organization = useActiveOrganization();
  const { disabled, pending } = useCurrentFeatureState();
  const exempt = featureLockExempt(pathname) || disabled || pending;
  const countEnabled = access?.disabledFeatures.includes("count") === false;
  const [queryNow, setQueryNow] = useState(minuteTimestamp);
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const { locations } = useLocationAccess();
  const lockEnabled = useQuery(
    api.count.getOtherFeaturesLockEnabled,
    organizationId && isAuthenticated && countEnabled ? {} : "skip",
  );
  const locationId = kiosk?.isKioskAccount
    ? kiosk.locationId
    : locations?.some((location) => location.id === storedLocationId)
      ? (storedLocationId as Id<"locations">)
      : (locations?.[0]?.id ?? null);
  const lockState = useQuery(
    api.count.getOtherFeaturesLockState,
    organizationId && isAuthenticated && countEnabled && lockEnabled && locationId
      ? {
          locationId,
          now: queryNow,
        }
      : "skip",
  );
  const currentLockState = useLastDefined(
    lockState,
    organizationId && locationId ? `${organizationId}:${locationId}` : null,
  );
  const isLocked =
    countEnabled && lockEnabled ? (currentLockState?.isLocked ?? false) : false;
  const lockReady =
    !countEnabled ||
    (locations !== undefined &&
      lockEnabled !== undefined &&
      (!lockEnabled || !locationId || currentLockState !== undefined));

  useEffect(() => {
    if (!lockEnabled) return;
    const timeout = window.setTimeout(() => setQueryNow(minuteTimestamp()), 0);
    return () => window.clearTimeout(timeout);
  }, [locationId, lockEnabled, organizationId]);

  useEffect(() => {
    const nextTransitionAt = currentLockState?.nextTransitionAt;
    if (
      !lockEnabled ||
      nextTransitionAt === null ||
      nextTransitionAt === undefined
    ) {
      return;
    }
    const refresh = () => setQueryNow(minuteTimestamp());
    const timeout = window.setTimeout(
      refresh,
      Math.max(0, nextTransitionAt - Date.now()) + 100,
    );
    const onVisibilityChange = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() >= nextTransitionAt
      ) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [currentLockState?.nextTransitionAt, lockEnabled]);

  useEffect(() => {
    if (isLocked && !exempt) router.replace("/count");
  }, [exempt, isLocked, router]);

  if (organizationId && isAuthenticated && !lockReady && !exempt) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Kontrollerer Count-status"
      >
        <Spinner className="size-5" />
      </main>
    );
  }

  if (isLocked && !exempt) {
    return (
      <main
        className="grid min-h-screen place-items-center"
        aria-label="Åbner Count"
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

function KioskDayBoundary({ children }: { children: React.ReactNode }) {
  const kiosk = useKiosk();
  const countLocked = useContext(FeatureLockContext);
  const pathname = usePathname();
  const router = useRouter();
  const [queryNow, setQueryNow] = useState(minuteTimestamp);
  const [dismissedKey, setDismissedKey] = useState(() => {
    try {
      return window.sessionStorage.getItem(END_OF_DAY_DISMISSED_KEY);
    } catch {
      return null;
    }
  });
  const state = useQuery(
    api.kioskDay.getState,
    kiosk?.kioskModeEnabled ? { now: queryNow } : "skip",
  );
  const current = useLastDefined(state, kiosk?.locationId ?? "kiosk");
  const nextTransitionAt = current?.nextTransitionAt;
  const onLinkedPage = Boolean(
    current?.phase &&
      current.tasks.some((task) => task.link && kioskDestinationMatches(task.link, pathname)),
  );
  const startOfDayDue =
    current?.phase === "startOfDay" && !countLocked && !onLinkedPage;

  useEffect(() => {
    if (nextTransitionAt === null || nextTransitionAt === undefined) return;
    const refresh = () => setQueryNow(minuteTimestamp());
    const timeout = window.setTimeout(
      refresh,
      Math.max(0, nextTransitionAt - Date.now()) + 100,
    );
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && Date.now() >= nextTransitionAt) {
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [nextTransitionAt]);

  useEffect(() => {
    if (startOfDayDue && pathname !== KIOSK_DAY_PATH) router.replace(KIOSK_DAY_PATH);
  }, [pathname, router, startOfDayDue]);

  if (kiosk?.kioskModeEnabled && current === undefined) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="Indlæser dagsopgaver">
        <Spinner className="size-5" />
      </main>
    );
  }

  if (startOfDayDue && pathname !== KIOSK_DAY_PATH) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="Åbner åbningsopgaver">
        <Spinner className="size-5" />
      </main>
    );
  }

  return (
    <KioskDayContext.Provider
      value={
        current
          ? {
              ...current,
              // Dismissal lasts until the closed period ends.
              endOfDayDismissed: dismissedKey === String(current.nextTransitionAt),
              dismissEndOfDay: () => {
                const key = String(current.nextTransitionAt);
                try {
                  window.sessionStorage.setItem(END_OF_DAY_DISMISSED_KEY, key);
                } catch {}
                setDismissedKey(key);
              },
            }
          : null
      }
    >
      {children}
    </KioskDayContext.Provider>
  );
}

function KioskDayPrompts() {
  const day = useKioskDay();
  const pathname = usePathname();
  const onLinkedPage = useOnLinkedDayTaskPage();
  const countLocked = useContext(FeatureLockContext);
  if (countLocked) return null;
  if (!day?.phase || pathname === KIOSK_DAY_PATH) return null;
  if (onLinkedPage) return null;
  if (day.phase !== "endOfDay" || day.endOfDayDismissed) return null;

  function dismiss() {
    if (!day) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || reduceMotion) {
      day.dismissEndOfDay();
      return;
    }
    // Morph the popup into the end-of-day shortcut (data-view-transition="end-of-day")
    // so staff see where it went.
    document.startViewTransition(() => flushSync(day.dismissEndOfDay));
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && dismiss()}>
      <AlertDialogContent data-view-transition="end-of-day">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <MoonIcon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>Lokationen er lukket</AlertDialogTitle>
          <AlertDialogDescription>
            Udfør lukkeopgaverne for at afslutte dagen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="lg">
            Senere
          </AlertDialogCancel>
          <AlertDialogAction size="lg" render={<Link href={KIOSK_DAY_PATH} />} nativeButton={false}>
            Gå til lukning
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function OrganizationHome() {
  const { data: organization } = useActiveOrganization();
  const { state, isMobile } = useSidebar();
  const { isAuthenticated } = useConvexAuth();
  const homeHref = useHomeDestination() ?? "/profile";
  const branding = useQuery(
    api.organization.getBranding,
    organization && isAuthenticated ? {} : "skip",
  );
  const logoUrl = organization?.logo;
  const wideLogoUrl = branding?.wideLogoUrl;
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
          unoptimized
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
            unoptimized
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
  const organization = useActiveOrganization();
  const { isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { navigation: visibleNavigation } = useAppNavigation();
  const itemOrder = useQuery(
    api.navigation.getOrder,
    organization.data && isAuthenticated ? {} : "skip",
  );
  const navigation = normalizeSidebarOrder(itemOrder).flatMap((id) => {
    const item = visibleNavigation.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <nav aria-label="Primær navigation">
          <SidebarMenu appearance="spaced">
            {navigation.map((item) => {
              const Icon = navigationIcons[item.id];
              const active =
                item.id === "organization"
                  ? pathname.startsWith("/administration")
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

function useTestOrganization() {
  const { isAuthenticated } = useConvexAuth();
  const current = useQuery(
    api.testOrganizations.current,
    isAuthenticated ? {} : "skip",
  );
  const enter = useMutation(api.testOrganizations.enter);
  const [switching, setSwitching] = useState(false);

  async function switchOrganization() {
    if (!current) return;
    setSwitching(true);
    try {
      const organizationId =
        current.kind === "test" ? current.sourceOrganizationId : await enter({});
      const { error } = await authClient.organization.setActive({ organizationId });
      if (error) throw new Error(error.message);
      // A full load resets organization-specific state such as theme and selections.
      window.location.assign("/");
    } catch (error) {
      setSwitching(false);
      toast.error(
        getUserErrorMessage(error, "Organisationen kunne ikke skiftes. Prøv igen."),
      );
    }
  }

  return { current, switching, switchOrganization };
}

function TestOrganizationBanner() {
  const { current, switching, switchOrganization } = useTestOrganization();
  if (current?.kind !== "test") return null;
  return (
    <div className="flex flex-col gap-3 px-4 pt-4 sm:flex-row sm:items-center">
      <Alert className="flex-1">
        <FlaskConicalIcon />
        <AlertTitle>Testorganisation</AlertTitle>
        <AlertDescription>
          Ændringer her påvirker ikke {current.sourceName}. E-mails og data til
          andre systemer sendes ikke.
        </AlertDescription>
      </Alert>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={switching}
        onClick={() => void switchOrganization()}
      >
        {switching ? <Spinner data-icon="inline-start" /> : null}
        Tilbage til {current.sourceName}
      </Button>
    </div>
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
  const { isAuthenticated } = useConvexAuth();
  const kiosk = useKiosk();
  const access = useAccess();
  const platformMember = useQuery(
    api.platform.members.me,
    isAuthenticated ? {} : "skip",
  );
  const canManageOrganization = canOpenAdministration(
    access?.permissions ?? [],
  );
  const testOrganization = useTestOrganization();
  const { isMobile, setOpenMobile } = useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const user = session?.user;
  const displayName = user?.name || "Profil";
  const email = kiosk?.isKioskAccount
    ? ((
        user as typeof user & {
          displayUsername?: string | null;
          username?: string | null;
        }
      )?.displayUsername ??
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
    pathname === "/profile" || pathname.startsWith("/administration");
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
              appearance="profile"
              className="group-data-[collapsible=icon]:size-12!"
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
          <DropdownMenuLabel appearance="inset">
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
          <DropdownMenuItem onClick={() => goTo("/help")}>
            <CircleHelpIcon />
            Hjælp
          </DropdownMenuItem>
          {canManageOrganization ? (
            <DropdownMenuItem onClick={() => goTo("/administration")}>
              <Building2Icon />
              Administration
            </DropdownMenuItem>
          ) : null}
          {testOrganization.current ? (
            <DropdownMenuItem
              disabled={testOrganization.switching}
              onClick={() => {
                setOpenMobile(false);
                void testOrganization.switchOrganization();
              }}
            >
              <FlaskConicalIcon />
              {testOrganization.current.kind === "test"
                ? `Tilbage til ${testOrganization.current.sourceName}`
                : "Åbn testorganisation"}
            </DropdownMenuItem>
          ) : null}
          {platformMember ? (
            <DropdownMenuItem onClick={() => goTo("/platform")}>
              <ShieldIcon />
              Platform
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
  const access = useAccess();
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
      if (enabled)
        router.replace(kioskHome(kiosk, countLocked, access?.disabledFeatures));
      router.refresh();
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Kiosktilstanden kunne ikke ændres. Prøv igen.",
        ),
      );
    } finally {
      setPending(false);
    }
  }

  if (!kiosk.kioskModeEnabled) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() => void change(true)}
      >
        {pending ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <MonitorIcon data-icon="inline-start" />
        )}
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
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={pending}
            />
          }
        >
          <MonitorIcon data-icon="inline-start" />
          Deaktivér kiosktilstand
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deaktivér kiosktilstand?</AlertDialogTitle>
            <AlertDialogDescription>
              Du får den normale brugerflade med de adgange, kontoens rolle
              tillader.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="default">
              Behold kiosktilstand
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void change(false)}
            >
              Deaktivér kiosktilstand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Shown after the closing popup is dismissed.
// Sidebar shortcut back to the day tasks: from a linked task page, or after the
// closing popup was dismissed.
function useDayTaskShortcut() {
  const day = useKioskDay();
  const pathname = usePathname();
  const countLocked = useContext(FeatureLockContext);
  const onLinkedPage = useOnLinkedDayTaskPage();
  if (countLocked || pathname === KIOSK_DAY_PATH) return null;
  if (onLinkedPage) return { label: "Tilbage til opgaverne", Icon: ListChecksIcon };
  if (day?.phase === "endOfDay" && day.endOfDayDismissed) {
    return { label: "Gå til lukning", Icon: MoonIcon };
  }
  return null;
}

function SidebarAccount({
  signingOut,
  onSignOut,
}: {
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const kiosk = useKiosk();
  const access = useAccess();
  const shortcut = useDayTaskShortcut();
  const kioskModeControl = <KioskModeControl />;
  const accountMenu = (
    <SidebarMenu appearance="spaced">
      {shortcut ? (
        <SidebarMenuItem>
          <SidebarMenuButton
            size="lg"
            variant="primary"
            appearance="icon"
            tooltip={shortcut.label}
            data-view-transition="end-of-day"
            className="group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center"
            render={<Link href={KIOSK_DAY_PATH} />}
          >
            <shortcut.Icon aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:hidden">{shortcut.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ) : null}
      <SidebarMenuItem>
        <FeedbackDialog permissions={access?.permissions} />
      </SidebarMenuItem>
      {!kiosk?.kioskModeEnabled ? (
        <SidebarMenuItem>
          <ProfileMenu signingOut={signingOut} onSignOut={onSignOut} />
        </SidebarMenuItem>
      ) : null}
    </SidebarMenu>
  );

  return (
    <SidebarFooter>
      {kiosk?.kioskModeEnabled ? accountMenu : kioskModeControl}
      {kiosk?.kioskModeEnabled ? kioskModeControl : accountMenu}
    </SidebarFooter>
  );
}

function MobileAccount({
  signingOut,
  onSignOut,
}: {
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const kiosk = useKiosk();
  const access = useAccess();
  const shortcut = useDayTaskShortcut();
  return (
    <div className="flex items-center gap-1">
      {shortcut ? (
        <Button
          size="icon-lg"
          aria-label={shortcut.label}
          data-view-transition="end-of-day"
          render={<Link href={KIOSK_DAY_PATH} />}
          nativeButton={false}
        >
          <shortcut.Icon />
        </Button>
      ) : null}
      <FeedbackDialog permissions={access?.permissions} compact />
      {!kiosk?.kioskModeEnabled ? (
        <ProfileMenu compact signingOut={signingOut} onSignOut={onSignOut} />
      ) : null}
    </div>
  );
}

function formatTimeLeft(milliseconds: number) {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} t ${rest} min` : `${hours} t`;
}

function SupportBanner({ className }: { className?: string }) {
  const support = useSupportSession();
  const endSupport = useMutation(api.platform.support.end);
  const [now, setNow] = useState(() => Date.now());
  const [ending, setEnding] = useState(false);
  const expiresAt = support?.expiresAt;

  useEffect(() => {
    if (!expiresAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    // The grant stops working on the server at expiry; reload so the app follows.
    const timeout = window.setTimeout(
      () => window.location.assign("/platform"),
      Math.max(0, expiresAt - Date.now()),
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [expiresAt]);

  if (!support) return null;

  async function end() {
    setEnding(true);
    try {
      await endSupport({});
      window.location.assign("/platform");
    } catch (error) {
      setEnding(false);
      toast.error(
        getUserErrorMessage(error, "Supportadgangen kunne ikke afsluttes. Prøv igen."),
      );
    }
  }

  return (
    <div
      className={cn(
        "sticky z-30 flex flex-col gap-3 bg-background px-4 pt-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <Alert className="flex-1">
        <LifeBuoyIcon />
        <AlertTitle>Supportadgang til {support.organizationName}</AlertTitle>
        <AlertDescription>
          {support.mode === "view" ? "Kun visning" : "Fuld adgang"}. Udløber om{" "}
          {formatTimeLeft(support.expiresAt - now)}.
        </AlertDescription>
      </Alert>
      <Button
        type="button"
        variant="outline"
        size="lg"
        disabled={ending}
        onClick={() => void end()}
      >
        {ending ? <Spinner data-icon="inline-start" /> : null}
        Afslut support
      </Button>
    </div>
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
  const { isAuthenticated } = useConvexAuth();
  const organizations = authClient.useListOrganizations();
  const activeOrganization = useActiveOrganization();
  const platformMember = useQuery(
    api.platform.members.me,
    isAuthenticated ? {} : "skip",
  );
  const [activationError, setActivationError] = useState(false);
  const activeOrganizationId = activeOrganization.data?.id;
  const firstOrganizationId = organizations.data?.[0]?.id;

  useEffect(() => {
    if (!required) return;
    if (organizations.isPending || activeOrganization.isPending) return;
    if (organizations.error || activeOrganization.error) return;
    if (activeOrganizationId) return;

    if (!firstOrganizationId) {
      // Platform staff usually have no organization of their own.
      if (platformMember === undefined) return;
      router.replace(platformMember ? "/platform" : "/onboarding");
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
    platformMember,
    required,
    router,
  ]);

  if (!required) return children;

  if (organizations.error || activeOrganization.error || activationError) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Siden kunne ikke indlæses</AlertTitle>
          <AlertDescription appearance="spaced" className="flex flex-col items-start">
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
  const organization = useActiveOrganization();
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
        if (!result.error) posthog.reset();
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

  const organizationRequired = pathname !== "/profile";
  const showAdministrationBack =
    pathname.startsWith("/administration/") &&
    !pathname.startsWith("/administration/products/");
  const showIntegrationsBack = pathname.startsWith("/administration/integrations/");
  const showCountHeader =
    pathname === "/count" || pathname.startsWith("/count/");
  const showOrderingHeader =
    pathname === "/ordering" || pathname.startsWith("/ordering/");
  const showWasteHeader =
    pathname === "/waste" || pathname.startsWith("/waste/");
  const showOwnChecksHeader =
    pathname === "/own-checks" || pathname.startsWith("/own-checks/");
  const showStaffFoodHeader =
    pathname === "/staff-food" || pathname.startsWith("/staff-food/");
  const showEmployeesHeader =
    pathname === "/employees" || pathname.startsWith("/employees/");
  const showTransfersHeader =
    pathname === "/transfers" || pathname.startsWith("/transfers/");
  const showInvoicesHeader =
    pathname === "/invoices" || pathname.startsWith("/invoices/");
  const showExpensesHeader =
    pathname === "/expenses" || pathname.startsWith("/expenses/");
  const showGoodsReceiptsHeader =
    pathname === "/goods-receipts" || pathname.startsWith("/goods-receipts/");
  const showDashboardHeader =
    pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  const showAdministrationHeader =
    pathname === "/administration" || pathname.startsWith("/administration/");
  const showPageHeader =
    pathname === "/date-labels" ||
    showOrderingHeader ||
    showCountHeader ||
    showWasteHeader ||
    showOwnChecksHeader ||
    showStaffFoodHeader ||
    showEmployeesHeader ||
    showTransfersHeader ||
    showInvoicesHeader ||
    showExpensesHeader ||
    showGoodsReceiptsHeader ||
    showDashboardHeader ||
    showAdministrationHeader;

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
        <OrganizationTheme>
          <AccessBoundary>
            <AnalyticsIdentity />
            <FeatureLockBoundary>
              <KioskDayBoundary>
              <KioskBehavior>
                <AppPageHeaderProvider>
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

                      <SidebarAccount
                        signingOut={signingOut}
                        onSignOut={() => setSigningOut(true)}
                      />
                    </Sidebar>

                    <SidebarInset className="min-w-0">
                      <header
                        className={cn(
                          "sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 md:border-b-0",
                          showPageHeader && "md:h-24 md:pr-8 md:pl-4 lg:pr-12",
                        )}
                      >
                        <SidebarTrigger size="icon-lg" />
                        {showPageHeader ? <AppPageHeaderTarget /> : null}
                        {showAdministrationBack ? (
                          <Button
                            variant="outline"
                            size="lg"
                            render={
                              <Link
                                href={showIntegrationsBack
                                  ? "/administration/integrations"
                                  : "/administration"}
                              />
                            }
                            nativeButton={false}
                          >
                            <ArrowLeftIcon data-icon="inline-start" />
                            <span className="hidden sm:inline">
                              {showIntegrationsBack
                                ? "Tilbage til integrationer"
                                : "Tilbage til administration"}
                            </span>
                            <span className="sm:hidden">Tilbage</span>
                          </Button>
                        ) : null}
                        <div className="flex flex-1 justify-center md:hidden">
                          <OrganizationHome />
                        </div>
                        <div className="md:hidden">
                          <MobileAccount
                            signingOut={signingOut}
                            onSignOut={() => setSigningOut(true)}
                          />
                        </div>
                      </header>
                      {/* Sticks below the sticky header, so offsets match its heights. */}
                      <SupportBanner
                        className={cn("top-16", showPageHeader && "md:top-24")}
                      />
                      <TestOrganizationBanner />

                      <div
                        className={cn(
                          "flex-1",
                          showPageHeader
                            ? "p-4"
                            : "px-5 py-8 sm:px-8 lg:px-12 lg:py-11",
                        )}
                      >
                        <KioskDayPrompts />
                        <FeatureRouteBoundary>{children}</FeatureRouteBoundary>
                      </div>
                    </SidebarInset>
                  </SidebarProvider>
                </AppPageHeaderProvider>
              </KioskBehavior>
              </KioskDayBoundary>
            </FeatureLockBoundary>
          </AccessBoundary>
        </OrganizationTheme>
      </OrganizationBoundary>
    </>
  );
}
