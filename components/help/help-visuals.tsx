import type { ReactNode } from "react";
import {
  ArrowRightIcon,
  BarChart3Icon,
  BoxesIcon,
  Building2Icon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CameraIcon,
  ChartNoAxesCombinedIcon,
  CheckCircle2Icon,
  CheckIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  Clock3Icon,
  FileChartColumnIcon,
  KeyRoundIcon,
  LinkIcon,
  ListOrderedIcon,
  LockKeyholeIcon,
  MapPinIcon,
  MessageSquarePlusIcon,
  MinusIcon,
  MonitorCogIcon,
  PackageCheckIcon,
  PackageIcon,
  PaletteIcon,
  PlusIcon,
  SearchIcon,
  Share2Icon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  StoreIcon,
  ThermometerIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersIcon,
  UsersRoundIcon,
  UtensilsIcon,
  WarehouseIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function WindowFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex min-h-10 items-center gap-1.5 border-b px-4">
        <span className="size-2 rounded-full bg-muted-foreground/20" />
        <span className="size-2 rounded-full bg-muted-foreground/20" />
        <span className="size-2 rounded-full bg-muted-foreground/20" />
        <span className="ml-auto text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {label}
        </span>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

function MiniControl({
  children,
  active = false,
}: {
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MetricBar({ label, width }: { label: string; width: string }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-2">
      <span className="truncate text-[0.65rem] text-muted-foreground">
        {label}
      </span>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full bg-primary", width)} />
      </div>
    </div>
  );
}

export function StartVisual() {
  const items = [
    { icon: BarChart3Icon, label: "Dashboard", active: true },
    { icon: PackageCheckIcon, label: "Transfer" },
    { icon: Trash2Icon, label: "Waste" },
    { icon: ClipboardCheckIcon, label: "Egenkontrol" },
    { icon: ClipboardListIcon, label: "Count" },
  ];

  return (
    <WindowFrame label="Sidemenu og lokationsvalg">
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <div className="flex flex-col gap-1 rounded-xl bg-muted p-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={cn(
                  "flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium",
                  item.active && "bg-background text-foreground",
                  !item.active && "text-muted-foreground",
                )}
              >
                <Icon className="size-3.5" />
                {item.label}
              </div>
            );
          })}
        </div>
        <div className="flex min-w-0 flex-col gap-4 rounded-xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Aktiv lokation</p>
              <p className="font-semibold">Lokation A</p>
            </div>
            <MiniControl>
              <MapPinIcon className="size-3" /> Skift lokation
            </MiniControl>
          </div>
          <div className="grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-2 text-center text-[0.65rem] font-medium text-muted-foreground">
            <span className="grid size-8 place-items-center rounded-full bg-primary text-primary-foreground">
              1
            </span>
            <span className="h-px bg-border" />
            <span className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground">
              2
            </span>
            <span className="h-px bg-border" />
            <span className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground">
              3
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-[0.65rem] text-muted-foreground">
            <span>Vælg</span>
            <span>Registrér</span>
            <span>Kontrollér</span>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function DashboardVisual() {
  const bars = ["h-[42%]", "h-[66%]", "h-[54%]", "h-[82%]", "h-[72%]", "h-full"];

  return (
    <WindowFrame label="Dashboard">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <MiniControl active>Drift</MiniControl>
          <MiniControl>
            <CalendarDaysIcon className="size-3" /> Seneste 7 dage
          </MiniControl>
          <MiniControl>
            <MapPinIcon className="size-3" /> Alle lokationer
          </MiniControl>
          <MiniControl>
            <PlusIcon className="size-3" /> Widget
          </MiniControl>
          <MiniControl>
            <Share2Icon className="size-3" /> Del
          </MiniControl>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1.25fr_0.75fr]">
          <div className="flex min-h-48 flex-col rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium">Omsætning</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">
                  284.500 kr.
                </p>
              </div>
              <Badge variant="success">+8,4 %</Badge>
            </div>
            <div className="mt-auto flex h-24 items-end gap-2 border-b border-l px-3 pt-3">
              {bars.map((height, index) => (
                <span
                  key={index}
                  className={cn(
                    "min-w-2 flex-1 rounded-t-sm bg-chart-2",
                    height,
                  )}
                />
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Waste-værdi</p>
              <p className="mt-1 text-xl font-semibold">2,1 %</p>
              <MetricBar label="Mål" width="w-2/3" />
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs text-muted-foreground">Arbejdstimer</p>
              <p className="mt-1 text-xl font-semibold">412 t.</p>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-3" />
                Sammenlignet med sidste periode
              </div>
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function WoltVisual() {
  const orders = [
    { number: "#2048", status: "Leveret", variant: "success" },
    { number: "#2047", status: "Klar", variant: "secondary" },
    { number: "#2046", status: "Annulleret", variant: "outline" },
  ] satisfies Array<{
    number: string;
    status: string;
    variant: "success" | "secondary" | "outline";
  }>;

  return (
    <WindowFrame label="Wolt-ordrer">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <MiniControl>
            <CalendarDaysIcon className="size-3" /> I dag
          </MiniControl>
          <MiniControl>
            <MapPinIcon className="size-3" /> Alle lokationer
          </MiniControl>
          <MiniControl>
            <SearchIcon className="size-3" /> Ordrenummer
          </MiniControl>
        </div>
        <div className="grid gap-3 md:grid-cols-[0.8fr_1.2fr]">
          <div className="flex flex-col gap-2">
            {orders.map((order, index) => (
              <div
                key={order.number}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border p-3",
                  index === 0 && "bg-muted/60",
                )}
              >
                <div className="flex items-center gap-2">
                  <ShoppingBagIcon className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs font-semibold">{order.number}</p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      Lokation A · 12.42
                    </p>
                  </div>
                </div>
                <Badge variant={order.variant}>{order.status}</Badge>
              </div>
            ))}
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Wolt-ordre #2048</p>
                <p className="text-xs text-muted-foreground">Afhentning · 248 kr.</p>
              </div>
              <Badge variant="success">
                <CheckIcon data-icon="inline-start" /> Leveret
              </Badge>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2.5 text-xs">
                <span>2 × Produkt A</span>
                <Badge variant="secondary">Koblet</Badge>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-muted p-2.5 text-xs">
                <span>1 × Produkt B</span>
                <Badge variant="outline">Ikke koblet</Badge>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-1 text-primary">
              <Clock3Icon className="size-4" />
              <span className="h-px bg-border" />
              <PackageCheckIcon className="size-4" />
              <span className="h-px bg-border" />
              <CheckCircle2Icon className="size-4" />
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function TransferVisual() {
  return (
    <WindowFrame label="Ny Transfer">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="rounded-xl bg-muted p-3">
            <StoreIcon className="size-4 text-muted-foreground" />
            <p className="mt-3 text-[0.65rem] text-muted-foreground">Fra</p>
            <p className="text-sm font-semibold">Lokation A</p>
          </div>
          <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
            <ArrowRightIcon className="size-4" />
          </span>
          <div className="rounded-xl bg-muted p-3">
            <StoreIcon className="size-4 text-muted-foreground" />
            <p className="mt-3 text-[0.65rem] text-muted-foreground">Til</p>
            <p className="text-sm font-semibold">Lokation B</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 bg-muted px-3 py-2 text-[0.65rem] font-medium text-muted-foreground">
            <span>Produkt</span>
            <span>Mængde</span>
            <span>Kontrol</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t px-3 py-3 text-xs">
            <span className="font-medium">Produkt A</span>
            <span>8 kg</span>
            <ThermometerIcon className="size-4 text-primary" />
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-t px-3 py-3 text-xs">
            <span className="font-medium">Produkt B</span>
            <span>3 kasser</span>
            <CheckCircle2Icon className="size-4 text-success" />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Ansvarlig · transferdato · kommentar
          </p>
          <MiniControl active>Opret Transfer</MiniControl>
        </div>
      </div>
    </WindowFrame>
  );
}

export function WasteVisual() {
  return (
    <WindowFrame label="Waste og dårlig levering">
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="flex flex-col rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Trash2Icon className="size-4 text-primary" /> Waste
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Genvej</p>
          <p className="mt-1 font-medium">Produkt A</p>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted p-1.5">
            <span className="grid size-8 place-items-center rounded-md bg-background">
              <MinusIcon className="size-3" />
            </span>
            <span className="text-sm font-semibold">2,5 kg</span>
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <PlusIcon className="size-3" />
            </span>
          </div>
          <span className="mt-3 text-center text-xs font-medium text-primary">
            Registrér Waste
          </span>
        </div>
        <div className="flex flex-col rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CameraIcon className="size-4 text-primary" /> Dårlig levering
          </div>
          <div className="mt-3 grid min-h-20 place-items-center rounded-lg border border-dashed bg-muted/50">
            <div className="text-center">
              <CameraIcon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-1 text-[0.65rem] text-muted-foreground">
                Foto og dokumentation
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span>Træk fra lager</span>
            <span className="h-5 w-9 rounded-full bg-primary p-0.5">
              <span className="ml-auto block size-4 rounded-full bg-primary-foreground" />
            </span>
          </div>
        </div>
        <div className="flex flex-col rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileChartColumnIcon className="size-4 text-primary" /> Rapport
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <MetricBar label="Produkt A" width="w-5/6" />
            <MetricBar label="Produkt B" width="w-1/2" />
            <MetricBar label="Produkt C" width="w-1/3" />
          </div>
          <div className="mt-auto flex items-center justify-between pt-4 text-[0.65rem] text-muted-foreground">
            <span>Åbn registrering</span>
            <span>Eksportér</span>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function OwnChecksVisual() {
  const checks = [
    { name: "Køletemperatur", time: "Inden kl. 10.00", status: "Udført", variant: "secondary" },
    { name: "Varemodtagelse", time: "Kl. 12.00", status: "Afvigelse", variant: "destructive" },
    { name: "Lukkerutine", time: "Kl. 21.30", status: "Ikke udført", variant: "outline" },
  ] satisfies Array<{
    name: string;
    time: string;
    status: string;
    variant: "secondary" | "destructive" | "outline";
  }>;

  return (
    <WindowFrame label="Egenkontrol">
      <div className="grid gap-4 md:grid-cols-[1fr_0.9fr]">
        <div className="flex flex-col gap-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">I dag</p>
              <p className="font-semibold">Planlagte kontroller</p>
            </div>
            <MiniControl>
              <MapPinIcon className="size-3" /> Lokation A
            </MiniControl>
          </div>
          {checks.map((check) => (
            <div
              key={check.name}
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{check.name}</p>
                <p className="text-[0.65rem] text-muted-foreground">{check.time}</p>
              </div>
              <Badge variant={check.variant}>{check.status}</Badge>
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-muted p-4">
          <div className="flex items-center gap-2">
            <ClipboardCheckIcon className="size-4 text-primary" />
            <p className="text-sm font-semibold">Varemodtagelse</p>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-lg bg-background p-3">
              <p className="text-[0.65rem] text-muted-foreground">Temperatur</p>
              <p className="mt-1 text-sm font-medium">7,4 °C</p>
            </div>
            <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              Afvigelse kræver opfølgning
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-background p-3 text-xs font-medium">
              <ShieldCheckIcon className="size-4 text-success" />
              Følg op, og godkend
            </div>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function StaffFoodVisual() {
  return (
    <WindowFrame label="Staff food">
      <div className="grid gap-4 md:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-xl bg-muted p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-full bg-background">
              <UserRoundIcon className="size-4" />
            </span>
            <div>
              <p className="text-xs font-semibold">Medarbejder</p>
              <p className="text-[0.65rem] text-muted-foreground">På vagt nu</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Clock3Icon className="size-4" />
            Vagt · 7,5 timer
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <MapPinIcon className="size-4" />
            Lokation A
          </div>
          <div className="mt-4 rounded-lg bg-background p-3 text-xs">
            <p className="font-medium">Reglen giver adgang til</p>
            <p className="mt-1 text-muted-foreground">1 måltid · 1 drik</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            {[
              { name: "Måltid", count: "1 valgt" },
              { name: "Drik", count: "1 valgt" },
            ].map((item) => (
              <div key={item.name} className="rounded-xl border p-3">
                <UtensilsIcon className="size-4 text-primary" />
                <p className="mt-3 text-xs font-medium">{item.name}</p>
                <p className="text-[0.65rem] text-muted-foreground">{item.count}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Valgte Produkter</p>
                <p className="text-sm font-semibold">2 i alt</p>
              </div>
              <Badge variant="success">Inden for reglen</Badge>
            </div>
          </div>
          <MiniControl active>Bekræft registrering</MiniControl>
        </div>
      </div>
    </WindowFrame>
  );
}

export function CountVisual() {
  const products = [
    { name: "Produkt A", unit: "kg", value: "12,5" },
    { name: "Produkt B", unit: "stk.", value: "24" },
    { name: "Produkt C", unit: "kasser", value: "3" },
    { name: "Produkt D", unit: "kg", value: "8" },
  ];

  return (
    <WindowFrame label="Count">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MiniControl active>Køl</MiniControl>
            <MiniControl>Frost</MiniControl>
            <MiniControl>Tørlager</MiniControl>
          </div>
          <Badge variant="secondary">
            <LockKeyholeIcon data-icon="inline-start" /> Count-vindue åbent
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {products.map((product) => (
            <div key={product.name} className="rounded-xl border p-3">
              <BoxesIcon className="size-4 text-primary" />
              <p className="mt-3 truncate text-xs font-medium">{product.name}</p>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted p-1">
                <MinusIcon className="size-3" />
                <span className="text-xs font-semibold">
                  {product.value} {product.unit}
                </span>
                <PlusIcon className="size-3" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <div className="flex justify-between text-[0.65rem] text-muted-foreground">
              <span>Område 1 af 3</span>
              <span>72 %</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-[72%] rounded-full bg-primary" />
            </div>
          </div>
          <MiniControl active>Registrér Count</MiniControl>
        </div>
        <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
          <WarehouseIcon className="size-3.5" />
          Lager viser den senest registrerede beholdning
        </div>
      </div>
    </WindowFrame>
  );
}

export function EmployeesVisual() {
  const days = ["Man", "Tir", "Ons", "Tor", "Fre"];
  const shifts = ["08 til 16", "10 til 18", "Fri", "08 til 16", "12 til 20"];

  return (
    <WindowFrame label="Medarbejdere">
      <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CalendarDaysIcon className="size-4 text-primary" /> Vagtplan
            </div>
            <MiniControl>Uge 36</MiniControl>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {days.map((day, index) => (
              <div key={day} className="min-w-0 text-center">
                <p className="text-[0.65rem] font-medium text-muted-foreground">{day}</p>
                <div
                  className={cn(
                    "mt-2 min-h-16 rounded-lg p-1.5 text-[0.6rem] font-medium",
                    shifts[index] === "Fri"
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary/10 text-primary",
                  )}
                >
                  {shifts[index]}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[0.65rem] text-muted-foreground">
            <Clock3Icon className="size-3.5" /> Tider følger lokationens tidszone
          </div>
        </div>
        <div className="rounded-xl bg-muted p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UsersRoundIcon className="size-4 text-primary" /> Register
          </div>
          <div className="mt-3 flex flex-col gap-2">
            {["Medarbejder A", "Medarbejder B", "Medarbejder C"].map(
              (name, index) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded-lg bg-background p-2.5"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-secondary text-[0.6rem] font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-xs font-medium">{name}</p>
                    <p className="text-[0.6rem] text-muted-foreground">Workfeed</p>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

const administrationGroups = [
  {
    label: "Grunddata",
    items: [
      { icon: PackageIcon, name: "Produkter", note: "Kategorier og enheder" },
      { icon: StoreIcon, name: "Lokationer", note: "Åbningstider og Count" },
      { icon: UsersIcon, name: "Brugere", note: "Roller og lokationsadgang" },
    ],
  },
  {
    label: "Daglig drift",
    items: [
      { icon: ClipboardListIcon, name: "Count", note: "Vindue og regler" },
      { icon: Trash2Icon, name: "Waste", note: "Genveje og leveringer" },
      { icon: ClipboardCheckIcon, name: "Egenkontrol", note: "Skabeloner og godkendelse" },
      { icon: UtensilsIcon, name: "Staff food", note: "Vagter og kategorier" },
      { icon: CalendarClockIcon, name: "Vagtplan", note: "Tidszone" },
      { icon: MonitorCogIcon, name: "Kiosk", note: "Sider, konti og nulstilling" },
    ],
  },
  {
    label: "Data og adgang",
    items: [
      { icon: LinkIcon, name: "Integrationer", note: "Workfeed, OnlinePOS og Wolt" },
      { icon: ChartNoAxesCombinedIcon, name: "Målinger", note: "Tilpassede dashboarddata" },
      { icon: KeyRoundIcon, name: "API", note: "Nøgler og rettigheder" },
    ],
  },
  {
    label: "Opsætning",
    items: [
      { icon: PaletteIcon, name: "Udseende", note: "Logoer og farver" },
      { icon: ListOrderedIcon, name: "Sidemenu", note: "Rækkefølge" },
      { icon: MessageSquarePlusIcon, name: "Feedback", note: "Modtagelse og historik" },
    ],
  },
];

export function AdministrationVisual() {
  return (
    <WindowFrame label="Administration">
      <div className="grid gap-5">
        {administrationGroups.map((group) => (
          <section key={group.label}>
            <p className="mb-2 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.name}
                    className="flex min-h-16 items-center gap-3 rounded-xl border p-3"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold">{item.name}</p>
                      <p className="truncate text-[0.65rem] text-muted-foreground">
                        {item.note}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </WindowFrame>
  );
}

export function AccessVisual() {
  return (
    <WindowFrame label="Adgang, profil og deling">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheckIcon className="size-4 text-primary" /> Roller
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {["Administrator", "Manager", "Medlem"].map((role, index) => (
              <div key={role} className="flex items-center justify-between gap-2 text-xs">
                <span>{role}</span>
                <div className="flex gap-1">
                  {Array.from({ length: 4 }, (_, permission) => (
                    <span
                      key={permission}
                      className={cn(
                        "size-2 rounded-full",
                        permission <= 3 - index ? "bg-primary" : "bg-muted",
                      )}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted p-2.5 text-[0.65rem] text-muted-foreground">
            <MapPinIcon className="size-3.5" /> Lokationsadgang pr. Bruger
          </div>
        </div>
        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <UserRoundIcon className="size-4 text-primary" /> Profil
          </div>
          <div className="mt-4 rounded-lg bg-muted p-3">
            <p className="text-[0.65rem] text-muted-foreground">Navn</p>
            <p className="text-xs font-medium">Din profil</p>
            <p className="mt-3 text-[0.65rem] text-muted-foreground">E-mail</p>
            <p className="truncate text-xs font-medium">bruger@organisation.dk</p>
          </div>
          <p className="mt-3 text-[0.65rem] text-muted-foreground">
            Konto og sessioner kan slettes fra Profil.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Share2Icon className="size-4 text-primary" /> Del dashboard
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-muted p-2.5 text-[0.65rem]">
              <LinkIcon className="size-3.5" /> Link med valgfri adgangskode
            </div>
          </div>
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <KeyRoundIcon className="size-4 text-primary" /> REST API
            </div>
            <p className="mt-2 text-[0.65rem] text-muted-foreground">
              API-nøgler får egne rettigheder, lokationer og udløbsdato.
            </p>
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}

export function HelpOverviewVisual() {
  const flow = [
    { icon: UserRoundIcon, label: "Rolle" },
    { icon: Building2Icon, label: "Lokation" },
    { icon: PackageIcon, label: "Handling" },
    { icon: FileChartColumnIcon, label: "Historik" },
  ];

  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-[repeat(7,auto)] sm:items-center sm:justify-between sm:p-6">
      {flow.map((item, index) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="contents">
            <div className="flex items-center gap-3 sm:flex-col sm:text-center">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-primary">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-[0.65rem] text-muted-foreground">Trin {index + 1}</p>
                <p className="text-xs font-semibold">{item.label}</p>
              </div>
            </div>
            {index < flow.length - 1 ? (
              <ArrowRightIcon className="hidden size-4 text-muted-foreground sm:block" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
