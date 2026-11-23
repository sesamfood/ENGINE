import type { HelpGuide } from "@/components/help/help-types";

export const economicGuide: HelpGuide = {
  integration: "economic",
  slug: "e-conomic",
  label: "e-conomic",
  summary:
    "Se kommende betalinger, betalinger sendt til banken og banksaldo under Økonomi.",
  appHref: "/administration/integrations/economic",
  appLinkLabel: "Åbn e-conomic-indstillinger",
  sections: [
    {
      id: "forbind",
      title: "Forbind e-conomic",
      steps: [
        "Åbn Administration → Integrationer → e-conomic, og aktivér integrationen. Det kræver adgang til alle lokationer.",
        "Indsæt organisationens AppSecretToken i Appnøgle og AgreementGrantToken i Aftalenøgle, og vælg Forbind e-conomic.",
        "Nøglerne gemmes krypteret og vises ikke igen.",
        "Med en Superuser-adgang vises aftalens navn, nummer og grundvaluta. Med en Bogholder-adgang vises beløbene i DKK.",
      ],
    },
    {
      id: "indstillinger",
      title: "Vælg kassekladde og bankkonto",
      steps: [
        "Under Økonomi vælger du den kassekladde, hvor betalinger ligger, når de er eksporteret til banken.",
        "Bankkonto er kontonummeret for banken i kontoplanen, normalt 5820. Vælg Gem indstillinger.",
      ],
    },
    {
      id: "oekonomi",
      title: "Brug Økonomi",
      bullets: [
        "Kommende betalinger viser bogførte leverandørfakturaer, som ikke er betalt endnu, sorteret efter forfaldsdato. e-conomic viser ikke, om en betaling allerede ligger klar i betalingsmodulet.",
        "Sendt til banken viser posteringerne i den valgte kassekladde med bankkontoen som modkonto.",
        "Banksaldo viser den bogførte saldo på bankkontoen. Vælg Indtast saldo for at gemme den aktuelle saldo fra banken.",
        "Data hentes fra e-conomic, når siden åbnes, og når du vælger Opdatér.",
        "Siden kræver adgangen Se Økonomi og adgang til alle lokationer. Indtastning af banksaldo kræver Redigere banksaldo.",
      ],
    },
    {
      id: "vedligehold",
      title: "Opdatér eller fjern",
      bullets: [
        "Opdatér forbindelse udskifter nøglerne. Forbinder du en anden aftale, nulstilles kassekladde, bankkonto og den indtastede banksaldo. Det sker også, hvis nøglerne ikke giver adgang til aftalenummeret.",
        "Fjern forbindelse sletter nøglerne og indstillingerne.",
      ],
    },
  ],
};
