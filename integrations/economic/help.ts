import type { HelpGuide } from "@/components/help/help-types";

export const economicGuide: HelpGuide = {
  integration: "economic",
  slug: "e-conomic",
  label: "e-conomic",
  summary:
    "Hent bogførte omkostninger og budget til Månedsrapport, og opret udgifter som kladder i e-conomic.",
  appHref: "/administration/integrations/economic",
  appLinkLabel: "Åbn e-conomic-indstillinger",
  sections: [
    {
      id: "forbind",
      title: "Forbind en aftale",
      steps: [
        "Åbn Administration → Integrationer → e-conomic, og aktivér integrationen. Det kræver adgang til alle lokationer.",
        "Vælg Forbind aftale. Indsæt organisationens AppSecretToken og AgreementGrantToken fra e-conomic, og vælg Forbind e-conomic.",
        "Brug Tilføj aftale, hvis kæden har flere aftaler. Nøglerne gemmes krypteret og vises ikke igen.",
      ],
    },
    {
      id: "koblinger",
      title: "Kobl lokationer og konti",
      steps: [
        "Vælg Redigér koblinger på aftalen.",
        "Under Lokationer vælger du den afdeling eller dimension, der fordeler posteringer på lokationer. Vælg Hele aftalen til én lokation, hvis aftalen kun dækker én Lokation.",
        "Under Konti og nøgletal vælger du konti og det nøgletal, hver konto indgår i: Nettoomsætning, Vareforbrug, Husleje, Forsyning eller Øvrige driftsomkostninger.",
        "Markér kun Vareforbruget er lagerreguleret og godkendt, hvis kontiene indeholder lagerregulering. Vælg Gem koblinger.",
      ],
      bullets: [
        "Posteringer uden en koblet dimensionsværdi fordeles ikke.",
        "Mangler koblinger betyder, at aftalen endnu ikke kan bruges i rapporten.",
      ],
    },
    {
      id: "brug",
      title: "Hvor bruges data",
      bullets: [
        "Månedsrapport henter bogførte beløb og budget med Opdatér e-conomic. Beløbene skal godkendes i rapporten. Omsætningen kommer fortsat fra salgsdata.",
        "Udgift kan oprette en udgift som kladde i den kassekladde, der er valgt under Administration → Udgift.",
      ],
    },
    {
      id: "vedligehold",
      title: "Opdatér eller fjern",
      bullets: [
        "Opdatér forbindelse udskifter nøglerne. En anden aftale skal tilføjes som en ny forbindelse.",
        "Kontakten på aftalen deaktiverer den uden at slette koblinger.",
        "Fjern aftale sletter nøglerne og aftalens konto- og lokationskoblinger.",
      ],
    },
  ],
  relatedLinks: [
    { href: "/help/dashboard/maanedsrapport", label: "Månedsrapport" },
    { href: "/help/udgift/overblik", label: "Udgift" },
  ],
};
