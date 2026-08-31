import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftIcon,
  ArrowRightLeftIcon,
  ArrowUpRightIcon,
  BookOpenIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  SettingsIcon,
  ShoppingBagIcon,
  Trash2Icon,
  UserRoundIcon,
  UsersRoundIcon,
  UtensilsIcon,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  AccessVisual,
  AdministrationVisual,
  CountVisual,
  DashboardVisual,
  EmployeesVisual,
  HelpOverviewVisual,
  OwnChecksVisual,
  StaffFoodVisual,
  StartVisual,
  TransferVisual,
  WasteVisual,
  WoltVisual,
} from "@/components/help/help-visuals";
import { cn } from "@/lib/utils";

type HelpNavigationItem = {
  id: string;
  number: string;
  label: string;
  icon: LucideIcon;
};

const navigationItems: HelpNavigationItem[] = [
  { id: "start", number: "00", label: "Start", icon: BookOpenIcon },
  { id: "dashboard", number: "01", label: "Dashboard", icon: LayoutDashboardIcon },
  { id: "wolt", number: "02", label: "Wolt-ordrer", icon: ShoppingBagIcon },
  { id: "transfer", number: "03", label: "Transfer", icon: ArrowRightLeftIcon },
  { id: "waste", number: "04", label: "Waste", icon: Trash2Icon },
  { id: "own-checks", number: "05", label: "Egenkontrol", icon: ClipboardCheckIcon },
  { id: "staff-food", number: "06", label: "Staff food", icon: UtensilsIcon },
  { id: "count", number: "07", label: "Count", icon: ClipboardListIcon },
  { id: "employees", number: "08", label: "Medarbejdere", icon: UsersRoundIcon },
  { id: "administration", number: "09", label: "Administration", icon: SettingsIcon },
  { id: "access", number: "10", label: "Adgang og profil", icon: UserRoundIcon },
];

function GuideNavigation() {
  return (
    <aside className="sticky top-16 z-10 -mx-4 border-y bg-background px-4 py-2 lg:top-24 lg:mx-0 lg:self-start lg:border-0 lg:bg-transparent lg:p-0">
      <nav aria-label="Indhold" className="overflow-x-auto lg:overflow-visible">
        <ol className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="group flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-full"
                >
                  <span className="font-mono text-[0.65rem] text-muted-foreground/70">
                    {item.number}
                  </span>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
    </aside>
  );
}

function FeatureGuide({
  id,
  number,
  label,
  title,
  summary,
  steps,
  note,
  href,
  linkLabel,
  visualLabel,
  caption,
  children,
}: {
  id: string;
  number: string;
  label: string;
  title: string;
  summary: string;
  steps: string[];
  note?: string;
  href: string;
  linkLabel: string;
  visualLabel: string;
  caption: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-32 border-t py-14 sm:py-20"
    >
      <div className="grid gap-10 xl:grid-cols-[minmax(16rem,0.72fr)_minmax(32rem,1.28fr)] xl:gap-16">
        <div className="flex flex-col items-start gap-5 xl:sticky xl:top-24 xl:self-start">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground">{number}</span>
            <Badge variant="outline">{label}</Badge>
          </div>
          <div className="flex flex-col gap-3">
            <h2
              id={`${id}-title`}
              className="text-3xl font-semibold tracking-tight sm:text-4xl"
            >
              {title}
            </h2>
            <p className="max-w-xl text-base leading-7 text-muted-foreground">
              {summary}
            </p>
          </div>
          <ol className="flex w-full flex-col gap-3" aria-label="Sådan gør du">
            {steps.map((step, index) => (
              <li key={step} className="grid grid-cols-[2rem_1fr] items-start gap-3">
                <span className="grid size-8 place-items-center rounded-full bg-muted font-mono text-xs font-semibold">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-6">{step}</p>
              </li>
            ))}
          </ol>
          {note ? (
            <p className="border-l-2 border-primary pl-4 text-sm leading-6 text-muted-foreground">
              {note}
            </p>
          ) : null}
          <Link
            href={href}
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "min-h-11",
            })}
          >
            {linkLabel}
            <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
          </Link>
        </div>
        <figure aria-label={visualLabel}>
          <div aria-hidden="true">{children}</div>
          <figcaption className="mt-3 text-xs leading-5 text-muted-foreground">
            {caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export function HelpPage() {
  return (
    <main id="main-content" className="min-h-screen bg-background">
      <a
        href="#help-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:ring-3 focus:ring-ring/50"
      >
        Gå til indhold
      </a>

      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex min-h-16 w-full max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href="#top"
            className="flex min-h-11 items-center gap-3 rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
              <BookOpenIcon className="size-4" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">Hjælp</span>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Guide til appen
              </span>
            </span>
          </Link>
          <Link
            href="/"
            className={buttonVariants({
              variant: "outline",
              size: "lg",
              className: "min-h-11",
            })}
          >
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            Åbn appen
          </Link>
        </div>
      </header>

      <div
        id="top"
        className="mx-auto grid w-full max-w-[96rem] gap-8 px-4 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:px-8"
      >
        <GuideNavigation />

        <div id="help-content" className="min-w-0">
          <section className="flex flex-col gap-8 py-14 sm:py-20 lg:py-24">
            <div className="grid gap-8 xl:grid-cols-[1fr_0.72fr] xl:items-end">
              <div className="flex max-w-4xl flex-col gap-5">
                <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
                  Brugerguide
                </p>
                <h1 className="text-5xl font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
                  Sådan bruger du appen
                </h1>
              </div>
              <div className="flex flex-col gap-4 xl:pb-1">
                <p className="text-lg leading-8 text-muted-foreground">
                  Find funktionen, følg trinene, og fortsæt i appen. Tegningerne
                  viser de valg, der betyder noget.
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Din sidemenu kan være kortere end guiden. Din rolle og
                  organisationens opsætning bestemmer, hvad du ser.
                </p>
              </div>
            </div>
            <HelpOverviewVisual />
          </section>

          <FeatureGuide
            id="start"
            number="00"
            label="Start"
            title="Find den rigtige opgave"
            summary="Sidemenuen samler de funktioner, du har adgang til. Kontrollér altid lokationen, før du registrerer noget."
            steps={[
              "Åbn funktionen i sidemenuen.",
              "Vælg lokation, hvis feltet ikke allerede er låst.",
              "Registrér arbejdet, eller åbn historikken for at kontrollere det.",
            ]}
            note="En låst lokation betyder, at din Bruger eller kioskkonto kun arbejder på den valgte Lokation."
            href="/"
            linkLabel="Gå til appen"
            visualLabel="Sidemenu, lokationsvalg og arbejdsgang"
            caption="Den samme rytme går igen i appen. Vælg, registrér, og kontrollér."
          >
            <StartVisual />
          </FeatureGuide>

          <FeatureGuide
            id="dashboard"
            number="01"
            label="Dashboard"
            title="Saml driften i widgets"
            summary="Dashboard viser målinger som omsætning, Waste og arbejdstimer. Hver widget har en fast visualisering og størrelse."
            steps={[
              "Vælg dashboard, periode og lokationer øverst.",
              "Tilføj en widget, og vælg måling og visning.",
              "Flyt widgets, så de vigtigste tal står først.",
              "Del en læsevisning, hvis andre skal følge tallene.",
            ]}
            note="Et delt dashboard kan få adgangskode. Du kan tilbagekalde linket senere."
            href="/dashboard"
            linkLabel="Åbn Dashboard"
            visualLabel="Dashboard med filtre, nøgletal og diagrammer"
            caption="Periode og lokationsvalg styrer alle widgets på dashboardet."
          >
            <DashboardVisual />
          </FeatureGuide>

          <FeatureGuide
            id="wolt"
            number="02"
            label="Wolt-ordrer"
            title="Følg ordre og status"
            summary="Wolt-ordrer samler varelinjer, beløb, produktkoblinger og statushistorik på tværs af lokationer."
            steps={[
              "Filtrér på dato, Lokation, status eller ordrenummer.",
              "Åbn en ordre for at se varer og koblede Produkter.",
              "Læs statushistorikken fra modtagelse til afslutning.",
            ]}
            note="Systemet gemmer og viser ikke forbrugeroplysninger."
            href="/wolt-orders"
            linkLabel="Åbn Wolt-ordrer"
            visualLabel="Wolt-ordreliste med varelinjer og statushistorik"
            caption="En ordre viser driftens data. Forbrugerdata er udeladt."
          >
            <WoltVisual />
          </FeatureGuide>

          <FeatureGuide
            id="transfer"
            number="03"
            label="Transfer"
            title="Flyt lager mellem lokationer"
            summary="Transfer flytter Produkter fra én Lokation til en anden og gemmer ansvarlig, transferdato, mængder og temperaturer."
            steps={[
              "Vælg fra- og til-lokation samt ansvarlig.",
              "Tilføj Produkter, enheder og mængder.",
              "Registrér temperatur, når Produktet kræver det.",
              "Opret transferen, og kontrollér den i Transferhistorik.",
            ]}
            note="Transferhistorik kan filtreres og eksporteres. Temperaturafvigelser markeres på transferen."
            href="/transfers"
            linkLabel="Opret Transfer"
            visualLabel="Transfer fra Lokation A til Lokation B med to Produktlinjer"
            caption="Lageret flyttes mellem de to valgte lokationer, når transferen oprettes."
          >
            <TransferVisual />
          </FeatureGuide>

          <FeatureGuide
            id="waste"
            number="04"
            label="Waste"
            title="Registrér tab og dårlige leveringer"
            summary="Waste trækker kasserede Produkter fra lageret. Dårlig levering gemmer billeder, dokumentation og de berørte Produkter."
            steps={[
              "Vælg Lokation og medarbejder.",
              "Brug en genvej, eller søg efter et Produkt og angiv mængden.",
              "Ved dårlig levering tilføjer du billeder, Produkter og kommentar.",
              "Brug Waste-rapporten til kontrol, eksport eller annullering.",
            ]}
            note="Når en aktiv Waste-registrering annulleres, lægges mængden tilbage på lageret. Ændringsloggen bevares."
            href="/waste"
            linkLabel="Registrér Waste"
            visualLabel="Waste-registrering, dårlig levering og Waste-rapport"
            caption="De tre visninger dækker registrering, dokumentation og opfølgning."
          >
            <WasteVisual />
          </FeatureGuide>

          <FeatureGuide
            id="own-checks"
            number="05"
            label="Egenkontrol"
            title="Udfør dagens kontroller"
            summary="Egenkontrol viser planlagte kontroller, frister, afvigelser og godkendelser for hver Lokation."
            steps={[
              "Vælg Lokation, og åbn en kontrol under I dag.",
              "Udfyld felterne og gem registreringen.",
              "Følg op på en afvigelse, før kontrollen godkendes.",
              "Brug Oversigt og Dokumentation til historik og inspektionsrapport.",
            ]}
            note="Organisationen kan kræve, at en anden person godkender kontrollen."
            href="/own-checks"
            linkLabel="Åbn Egenkontrol"
            visualLabel="Dagens egenkontroller med status, afvigelse og godkendelse"
            caption="Status viser, hvad der mangler, hvad der afviger, og hvad der er godkendt."
          >
            <OwnChecksVisual />
          </FeatureGuide>

          <FeatureGuide
            id="staff-food"
            number="06"
            label="Staff food"
            title="Registrér mad til medarbejdere"
            summary="Staff food bruger vagtens længde og organisationens regler til at vise, hvilke Produkter medarbejderen må vælge."
            steps={[
              "Find medarbejderen, eller vælg en person på vagt.",
              "Kontrollér Lokation og vagtlængde.",
              "Vælg Produkter inden for de viste kategori-regler.",
              "Kontrollér kurven, og bekræft registreringen.",
            ]}
            note="Hvis medarbejderen ikke er på vagt, kan en manuel vagtlængde bruges, når reglerne tillader det."
            href="/staff-food"
            linkLabel="Åbn Staff food"
            visualLabel="Medarbejder, Staff food-regel og valgte Produkter"
            caption="Reglen beregnes først. Derefter vises de Produkter, medarbejderen kan vælge."
          >
            <StaffFoodVisual />
          </FeatureGuide>

          <FeatureGuide
            id="count"
            number="07"
            label="Count"
            title="Afstem lageret"
            summary="Count tæller lageret pr. Produkt og enhed. Organisationen kan dele optællingen i områder og styre et fast Count-vindue."
            steps={[
              "Vælg Lokation og Count-område.",
              "Tæl ét Produkt ad gangen, eller brug gittervisningen.",
              "Angiv mængden i den rigtige enhed.",
              "Registrér Count med en begrundelse, og kontrollér Lager bagefter.",
            ]}
            note="Registreringen overskriver lageret for Produkter med en angivet mængde. Andre Produkter beholder deres lager. En afsluttet Count kan ikke rettes."
            href="/count"
            linkLabel="Åbn Count"
            visualLabel="Count-områder, Produktmængder og fremdrift"
            caption="Områder kan tælles hver for sig. Fremdriften viser, hvad der mangler."
          >
            <CountVisual />
          </FeatureGuide>

          <FeatureGuide
            id="employees"
            number="08"
            label="Medarbejdere"
            title="Se vagter og medarbejdere"
            summary="Medarbejdere viser vagtplan og register fra Workfeed for de lokationer, du har adgang til."
            steps={[
              "Vælg uge og Lokation i Vagtplan.",
              "Læs vagter og tider i lokationens tidszone.",
              "Åbn Register for at finde en bestemt medarbejder.",
            ]}
            note="En Administrator forbinder Workfeed og kobler hver Lokation til den rigtige afdeling."
            href="/employees"
            linkLabel="Åbn Medarbejdere"
            visualLabel="Ugentlig vagtplan og medarbejderregister"
            caption="Vagtplan og register bruger de afdelinger, der er koblet i Workfeed."
          >
            <EmployeesVisual />
          </FeatureGuide>

          <FeatureGuide
            id="administration"
            number="09"
            label="Administration"
            title="Sæt organisationen op"
            summary="Administration samler grunddata, regler, integrationer, design og teknisk adgang. Hver Bruger ser kun de områder, rollen giver adgang til."
            steps={[
              "Opret først Produkter, enheder og lokationer.",
              "Invitér Brugere, og giv dem roller og lokationsadgang.",
              "Indstil Count, Waste, Egenkontrol, Staff food og kiosk.",
              "Forbind Workfeed, OnlinePOS og Wolt, hvis de bruges.",
            ]}
            note="API-nøgler har egne rettigheder, lokationsvalg og udløbsdato. Tilpassede målinger bliver tilgængelige i widgetlisten."
            href="/organization"
            linkLabel="Åbn Administration"
            visualLabel="Alle områder i Administration grupperet efter formål"
            caption="Start med Grunddata. Tilføj driftsregler og integrationer bagefter."
          >
            <AdministrationVisual />
          </FeatureGuide>

          <FeatureGuide
            id="access"
            number="10"
            label="Adgang og profil"
            title="Styr, hvem der kan hvad"
            summary="Roller styrer handlinger og datavisning. Lokationsadgang begrænser, hvilke lokationer en Bruger kan arbejde med."
            steps={[
              "Brug Administrator, Manager eller Medlem som udgangspunkt.",
              "Tilpas roller, rettigheder og lokationsadgang i Administration.",
              "Åbn Profil for at se kontooplysninger eller slette din konto.",
              "Brug delte dashboards eller REST API, når data skal ud af appen.",
            ]}
            note="Kioskkonti bindes til én Lokation. De kan få en fast startside og automatisk vende tilbage efter inaktivitet."
            href="/profile"
            linkLabel="Åbn Profil"
            visualLabel="Roller, lokationsadgang, Profil, delte dashboards og REST API"
            caption="Rolle og Lokation arbejder sammen. Begge dele begrænser adgangen."
          >
            <AccessVisual />
          </FeatureGuide>

          <footer className="flex flex-col gap-6 border-t py-12 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">Mangler du en funktion?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Bed en Administrator kontrollere din rolle og lokationsadgang.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/api/v1/docs"
                className={buttonVariants({
                  variant: "outline",
                  size: "lg",
                  className: "min-h-11",
                })}
              >
                <KeyRoundIcon data-icon="inline-start" aria-hidden="true" />
                REST API
              </Link>
              <Link
                href="/"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "min-h-11",
                )}
              >
                Åbn appen
                <ArrowUpRightIcon data-icon="inline-end" aria-hidden="true" />
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
