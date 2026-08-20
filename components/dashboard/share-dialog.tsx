"use client";

import { useState } from "react";
import { CopyIcon, LinkIcon, Share2Icon, Trash2Icon } from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function message(error: unknown) {
  return error instanceof Error ? error.message : "Delingen kunne ikke ændres";
}

function link(token: string) {
  return `${window.location.origin}/share/${token}`;
}

export function ShareDialog({
  dashboardId,
  dashboardName,
  onBeforeCreate,
}: {
  dashboardId: Id<"dashboards">;
  dashboardName?: string;
  onBeforeCreate?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(dashboardName ?? "Dashboard");
  const [password, setPassword] = useState("");
  const [days, setDays] = useState("7");
  const [pending, setPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const createShare = useAction(api.dashboard.createShare);
  const revokeShare = useMutation(api.dashboard.revokeShare);
  const shares = useQuery(api.dashboard.listShares, open ? { dashboardId } : "skip");

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(link(token));
      toast.success("Linket er kopieret");
    } catch {
      toast.error("Linket kunne ikke kopieres");
    }
  }

  async function create() {
    setPending(true);
    try {
      await onBeforeCreate?.();
      const share = await createShare({
        dashboardId,
        name,
        password: password.trim() || undefined,
        expiresAt: Date.now() + Number(days) * 24 * 60 * 60 * 1_000,
      });
      await copy(share.token);
      setPassword("");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) { setNow(Date.now()); setName(dashboardName ?? "Dashboard"); } }}>
      <DialogTrigger render={<Button type="button" size="lg" className="min-h-11" variant="outline" />}>
        <Share2Icon data-icon="inline-start" />
        Del
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Del dashboard</DialogTitle>
          <DialogDescription>
            Linket viser et øjebliksbillede af layout, lokationsvalg og periode. Data forbliver opdateret.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="share-name">Navn</FieldLabel>
            <Input id="share-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="share-expiry">Udløber efter</FieldLabel>
            <Select items={[
              { value: "1", label: "1 dag" },
              { value: "7", label: "7 dage" },
              { value: "30", label: "30 dage" },
              { value: "90", label: "90 dage" },
            ]} value={days} onValueChange={(value) => value && setDays(value)}>
              <SelectTrigger id="share-expiry" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="1">1 dag</SelectItem>
                  <SelectItem value="7">7 dage</SelectItem>
                  <SelectItem value="30">30 dage</SelectItem>
                  <SelectItem value="90">90 dage</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="share-password">Adgangskode</FieldLabel>
            <Input id="share-password" type="password" value={password} maxLength={128} onChange={(event) => setPassword(event.target.value)} />
            <FieldDescription>
              Påkrævet når dashboardet indeholder admin-målinger som omsætning. Mindst 4 tegn.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" onClick={() => void create()} disabled={pending || !name.trim()}>
            {pending ? <Spinner data-icon="inline-start" /> : <LinkIcon data-icon="inline-start" />}
            Opret og kopiér link
          </Button>
        </DialogFooter>
        <Separator />
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Aktive og tidligere links</h3>
          {shares === undefined ? <Spinner /> : shares.length === 0 ? (
            <p className="text-sm text-muted-foreground">Der er ikke oprettet delingslinks endnu.</p>
          ) : shares.map((share) => {
            const inactive = Boolean(share.revokedAt) || share.expiresAt <= now;
            return (
              <div key={share.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{share.name}</p>
                    {inactive ? <Badge variant="outline">Inaktivt</Badge> : null}
                    {share.requiresPassword ? <Badge variant="secondary">Adgangskode</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Udløber {new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeStyle: "short" }).format(share.expiresAt)}
                  </p>
                </div>
                {!inactive ? (
                  <>
                    <Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label={`Kopiér ${share.name}`} onClick={() => void copy(share.token)}>
                      <CopyIcon />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger render={<Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label={`Tilbagekald ${share.name}`} />}>
                        <Trash2Icon />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Tilbagekald delingslink?</AlertDialogTitle>
                          <AlertDialogDescription>Linket holder straks op med at virke. Handlingen kan ikke fortrydes.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Behold link</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => void revokeShare({ shareId: share.id }).catch((error) => toast.error(message(error)))}>
                            Tilbagekald
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
