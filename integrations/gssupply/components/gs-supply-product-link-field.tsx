"use client";

import { useQuery } from "convex/react";
import { useAccess, usePermission } from "@/components/app-shell";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useIntegrations } from "@/integrations/use-integrations";
import { GsSupplyLinkEditor, useGsSupplyCatalog } from "./gs-supply-link-editor";

export function GsSupplyProductLinkField({
  productId,
  productName,
}: {
  productId: Id<"products">;
  productName: string;
}) {
  const access = useAccess();
  const integrations = useIntegrations();
  const enabled =
    usePermission("integrations.manage") &&
    integrations?.gssupply === true &&
    access?.locationScope.all === true;
  const settings = useQuery(api.integrations.gssupply.api.getSettings, enabled ? {} : "skip");
  const connected = Boolean(settings?.connection);
  const data = useQuery(
    api.integrations.gssupply.api.getProductLink,
    enabled && connected ? { productId } : "skip",
  );
  const { products, reload } = useGsSupplyCatalog(enabled && connected);
  if (!data) return null;
  return (
    <Field>
      <FieldLabel>GS Supply-produkt</FieldLabel>
      <GsSupplyLinkEditor
        productId={productId}
        productName={productName}
        units={data.units}
        link={data.link}
        catalog={products}
        onRetry={reload}
      />
      <FieldDescription>
        Vælg også den enhed, én pakke fra GS Supply svarer til. Koblingen gemmes med det samme.
      </FieldDescription>
    </Field>
  );
}
