"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatformRole } from "@/components/platform/platform-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

function slugify(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("da")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export function PlatformOrganizationForm() {
  const role = usePlatformRole();
  const router = useRouter();
  const createOrganization = useMutation(
    api.platform.lifecycle.createOrganization,
  );
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [saving, setSaving] = useState(false);

  if (role !== "owner") {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun platformejere kan oprette organisationer.
        </AlertDescription>
      </Alert>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const organizationId = await createOrganization({
        name,
        slug,
        adminEmail,
      });
      toast.success(`${name.trim()} er oprettet, og invitationen er sendt`);
      router.push(`/platform/organizations/${organizationId}`);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Organisationen kunne ikke oprettes. Prøv igen."),
      );
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Ny organisation</h1>
      <form onSubmit={submit} className="max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>Organisation og første Administrator</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="platform-organization-name">Navn</FieldLabel>
                <Input
                  id="platform-organization-name"
                  value={name}
                  maxLength={100}
                  required
                  disabled={saving}
                  onChange={(event) => {
                    setName(event.target.value);
                    if (!slugEdited) setSlug(slugify(event.target.value));
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="platform-organization-slug">Slug</FieldLabel>
                <Input
                  id="platform-organization-slug"
                  value={slug}
                  maxLength={60}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  required
                  disabled={saving}
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.target.value);
                  }}
                />
                <FieldDescription>
                  Små bogstaver, tal og bindestreger.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="platform-organization-admin">
                  E-mail for første Administrator
                </FieldLabel>
                <Input
                  id="platform-organization-admin"
                  type="email"
                  autoComplete="off"
                  value={adminEmail}
                  required
                  disabled={saving}
                  onChange={(event) => setAdminEmail(event.target.value)}
                />
                <FieldDescription>
                  Personen får en invitation, der udløber om syv dage.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button type="submit" size="lg" disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Opret organisation
            </Button>
          </CardFooter>
        </Card>
      </form>
    </section>
  );
}
