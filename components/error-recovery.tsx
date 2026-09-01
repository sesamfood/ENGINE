"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export function ErrorRecovery({
  errorCode,
  fullPage = false,
  retry,
}: {
  errorCode?: string;
  fullPage?: boolean;
  retry: () => void;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center",
        fullPage && "min-h-screen p-4",
      )}
    >
      <Empty
        role="alert"
        className="mx-auto min-h-80 w-full max-w-[96rem] border"
      >
        <EmptyHeader>
          <EmptyTitle>Siden kunne ikke indlæses</EmptyTitle>
          <EmptyDescription>
            Prøv igen. Hvis fejlen fortsætter, kan du genindlæse hele siden.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={retry}>
              Prøv igen
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Genindlæs siden
            </Button>
          </div>
          {errorCode ? (
            <p className="text-xs text-muted-foreground">
              Fejlkode: <code>{errorCode}</code>
            </p>
          ) : null}
        </EmptyContent>
      </Empty>
    </div>
  );
}
