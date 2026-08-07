"use client";

import { useEffect, useRef, useState } from "react";
import { LockKeyholeIcon } from "lucide-react";
import { useAction, useQuery } from "convex/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { DashboardGrid } from "./dashboard-grid";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Dashboardet kunne ikke åbnes";
}

export function SharedDashboard({ token }: { token: string }) {
  const meta = useQuery(api.dashboardShare.getPublicMeta, { token });
  const unlock = useAction(api.dashboardShare.unlock);
  const [accessKey, setAccessKey] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const automaticUnlockAttempted = useRef(false);
  const config = useQuery(
    api.dashboardShare.getSharedConfig,
    accessKey ? { token, accessKey } : "skip",
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setAccessKey(window.sessionStorage.getItem(`dashboard-share:${token}`));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [token]);

  useEffect(() => {
    if (!meta || meta.requiresPassword || accessKey || pending || automaticUnlockAttempted.current) return;
    automaticUnlockAttempted.current = true;
    setPending(true);
    void unlock({ token, password: "" })
      .then((result) => {
        window.sessionStorage.setItem(`dashboard-share:${token}`, result.unlockKey);
        setAccessKey(result.unlockKey);
      })
      .catch((cause) => setError(message(cause)))
      .finally(() => setPending(false));
  }, [accessKey, meta, pending, token, unlock]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await unlock({ token, password });
      window.sessionStorage.setItem(`dashboard-share:${token}`, result.unlockKey);
      setAccessKey(result.unlockKey);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setPending(false);
    }
  }

  if (meta === undefined) return <div className="mx-auto max-w-7xl p-6"><Skeleton className="h-96" /></div>;
  if (meta === null) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><LockKeyholeIcon /></EmptyMedia>
            <EmptyTitle>Dashboardet er ikke tilgængeligt</EmptyTitle>
            <EmptyDescription>Linket er udløbet, tilbagekaldt eller ugyldigt.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }
  if (!accessKey) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>{meta.name}</CardTitle>
            <CardDescription>{meta.requiresPassword ? "Indtast adgangskoden for at åbne dashboardet." : "Dashboardet åbnes…"}</CardDescription>
          </CardHeader>
          <CardContent>
            {meta.requiresPassword ? (
              <form onSubmit={submit} className="flex flex-col gap-4">
                <FieldGroup>
                  <Field data-invalid={Boolean(error)}>
                    <FieldLabel htmlFor="shared-dashboard-password">Adgangskode</FieldLabel>
                    <Input id="shared-dashboard-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} aria-invalid={Boolean(error)} autoFocus />
                  </Field>
                </FieldGroup>
                {error ? <Alert variant="destructive"><AlertTitle>Dashboardet kunne ikke åbnes</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
                <Button type="submit" disabled={pending || !password}>
                  {pending ? <Spinner data-icon="inline-start" /> : <LockKeyholeIcon data-icon="inline-start" />}
                  Åbn dashboard
                </Button>
              </form>
            ) : <div className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner /> Åbner dashboard…</div>}
          </CardContent>
        </Card>
      </main>
    );
  }
  if (config === undefined) return <div className="mx-auto max-w-7xl p-6"><Skeleton className="h-96" /></div>;

  return (
    <main className="min-h-screen bg-muted/25 px-4 py-8 sm:px-6 lg:px-10">
      <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <header className="flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Delt dashboard</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{meta.name}</h1>
          <p className="text-sm text-muted-foreground">Tilgængeligt til {new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeStyle: "short" }).format(meta.expiresAt)}</p>
        </header>
        <DashboardGrid widgets={config.widgets} scope={config.scope} range={config.range} publicAccess={{ token, accessKey }} />
      </section>
    </main>
  );
}
