"use client";

import { useMutation } from "convex/react";
import { LockKeyholeIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/convex/_generated/api";

export function KioskPinGate() {
  const unlock = useMutation(api.kiosk.unlockPinPages);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const message = await unlock({ pin });
      setError(message);
      if (message) setPin("");
    } catch {
      setError("PIN-koden kunne ikke kontrolleres. Prøv igen");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-96 items-center">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockKeyholeIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>
            <h1>Siden er låst</h1>
          </EmptyTitle>
          <EmptyDescription>
            Indtast lokationens PIN-kode for at åbne siden.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="kiosk-pin" className="sr-only">
                PIN-kode
              </FieldLabel>
              <Input
                id="kiosk-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                maxLength={8}
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
                aria-invalid={Boolean(error)}
                className="h-12 text-center"
              />
              <FieldError>{error}</FieldError>
            </Field>
            <Button type="submit" size="lg" className="h-12" disabled={pending || pin.length < 4}>
              Lås op
            </Button>
          </form>
        </EmptyContent>
      </Empty>
    </main>
  );
}
