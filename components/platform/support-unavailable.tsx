import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SupportUnavailable({ children }: { children: React.ReactNode }) {
  return (
    <Alert className="max-w-xl">
      <AlertTitle>Ikke tilgængelig under supportadgang</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}
