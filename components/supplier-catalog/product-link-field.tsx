"use client";

import { useQuery } from "convex/react";
import { useAccess, usePermission } from "@/components/app-shell";
import { Field, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import type { Id } from "@/convex/_generated/dataModel";
import { useIntegrations } from "@/integrations/use-integrations";
import { useSupplierCatalog, type SupplierCatalog } from "./catalog";
import { CatalogLinkEditor } from "./link-editor";

export function CatalogProductLinkField({
  catalog,
  productId,
  productName,
}: {
  catalog: SupplierCatalog;
  productId: Id<"products">;
  productName: string;
}) {
  const access = useAccess();
  const integrations = useIntegrations();
  const enabled =
    usePermission("integrations.manage") &&
    integrations?.[catalog.id] === true &&
    access?.locationScope.all === true;
  const settings = useQuery(catalog.api.getSettings, enabled ? {} : "skip");
  const connected = Boolean(settings?.connection);
  const data = useQuery(
    catalog.api.getProductLink,
    enabled && connected ? { productId } : "skip",
  );
  const { products, reload } = useSupplierCatalog(
    enabled && connected ? catalog : null,
  );
  if (!data) return null;
  return (
    <Field>
      <div className="flex items-center gap-2">
        <FieldLabel>{catalog.name}-produkt</FieldLabel>
        <HelpTooltip
          label={`${catalog.name}-produkt`}
          content={`Vælg også den enhed, én pakke fra ${catalog.name} svarer til. Koblingen gemmes med det samme.`}
        />
      </div>
      <CatalogLinkEditor
        catalog={catalog}
        productId={productId}
        productName={productName}
        units={data.units}
        link={data.link}
        products={products}
        onRetry={reload}
      />
    </Field>
  );
}
