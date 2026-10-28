import {
  BanknoteIcon,
  CircleCheckIcon,
  ClipboardCheckIcon,
  CoffeeIcon,
  CookingPotIcon,
  DoorClosedIcon,
  DropletsIcon,
  FlameIcon,
  KeyRoundIcon,
  LightbulbIcon,
  LockIcon,
  PackageIcon,
  PowerIcon,
  RefrigeratorIcon,
  SnowflakeIcon,
  SparklesIcon,
  SprayCanIcon,
  ThermometerIcon,
  Trash2Icon,
  UtensilsIcon,
  WindIcon,
  type LucideIcon,
} from "lucide-react";
import type { KioskDayTaskIcon } from "@/lib/kiosk-day";

export const kioskDayTaskIconOptions: Record<
  KioskDayTaskIcon,
  { icon: LucideIcon; label: string }
> = {
  check: { icon: CircleCheckIcon, label: "Flueben" },
  sparkles: { icon: SparklesIcon, label: "Rengøring" },
  sprayCan: { icon: SprayCanIcon, label: "Desinfektion" },
  trash: { icon: Trash2Icon, label: "Affald" },
  thermometer: { icon: ThermometerIcon, label: "Temperatur" },
  refrigerator: { icon: RefrigeratorIcon, label: "Køleskab" },
  snowflake: { icon: SnowflakeIcon, label: "Frost" },
  flame: { icon: FlameIcon, label: "Komfur og gas" },
  cookingPot: { icon: CookingPotIcon, label: "Køkken" },
  utensils: { icon: UtensilsIcon, label: "Service" },
  coffee: { icon: CoffeeIcon, label: "Kaffemaskine" },
  droplets: { icon: DropletsIcon, label: "Vand og opvask" },
  wind: { icon: WindIcon, label: "Ventilation" },
  lightbulb: { icon: LightbulbIcon, label: "Lys" },
  power: { icon: PowerIcon, label: "Strøm" },
  banknote: { icon: BanknoteIcon, label: "Kasse" },
  package: { icon: PackageIcon, label: "Varer" },
  clipboard: { icon: ClipboardCheckIcon, label: "Kontrol" },
  doorClosed: { icon: DoorClosedIcon, label: "Døre" },
  lock: { icon: LockIcon, label: "Lås" },
  key: { icon: KeyRoundIcon, label: "Nøgler" },
};

export function KioskDayTaskIconView({ icon }: { icon?: KioskDayTaskIcon }) {
  const Icon = kioskDayTaskIconOptions[icon ?? "check"].icon;
  return <Icon aria-hidden="true" />;
}
