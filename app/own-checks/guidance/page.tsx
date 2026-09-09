import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

const sources = [
  {
    title: "Risici ved råvarer",
    source: "Sikre fødevarer",
    description: "Find vejledning om risici ved de råvarer, I bruger i køkkenet.",
    href: "https://sikrefoedevarer.foedevarestyrelsen.dk/Foedevarer",
    action: "Se råvarer",
  },
  {
    title: "Processer og håndtering",
    source: "Sikre fødevarer",
    description: "Find vejledning om processerne i køkkenet og de risici, der følger med.",
    href: "https://sikrefoedevarer.foedevarestyrelsen.dk/Proces",
    action: "Se processer",
  },
  {
    title: "HACCP og risikoanalyse",
    source: "Fødevarestyrelsen",
    description: "Læs om HACCP-principperne, og find skabeloner til virksomhedens risikoanalyse.",
    href: "https://foedevarestyrelsen.dk/kost-og-foedevarer/start-og-drift-af-foedevarevirksomhed/egenkontrol-og-risikoanalyse/haccp-principperne",
    action: "Se HACCP-vejledning",
  },
];

export default function OwnChecksGuidancePage() {
  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold">Vejledning</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {sources.map((source) => (
          <Card key={source.href}>
            <CardHeader>
              <CardTitle>{source.title}</CardTitle>
              <CardDescription>{source.description}</CardDescription>
              <p className="text-sm text-muted-foreground">Kilde: {source.source}</p>
            </CardHeader>
            <CardFooter className="mt-auto">
              <Button
                variant="outline"
                className="min-h-11"
                nativeButton={false}
                render={<a href={source.href} target="_blank" rel="noopener noreferrer" />}
              >
                {source.action}
                <ExternalLinkIcon data-icon="inline-end" />
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
