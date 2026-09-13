import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

export const menuGroupValidator = v.object({
  id: v.string(),
  title: v.string(),
  quantity: v.number(),
});

export const menuGroupInputValidator = menuGroupValidator.extend({
  productIds: v.array(v.id("products")),
});

export function menuGroups(
  menu: Pick<Doc<"onlinePosMenus">, "groups" | "products">,
) {
  if (menu.groups) {
    return menu.groups.map((group) => ({
      ...group,
      productIds: menu.products
        .filter((product) => product.groupId === group.id)
        .map((product) => product.productId),
    }));
  }
  return [
    { id: "primary", title: "Primære produkter" },
    { id: "additional", title: "Ekstra produkter" },
  ].flatMap((group) => {
    const productIds = menu.products
      .filter((product) => product.kind === group.id)
      .map((product) => product.productId);
    return productIds.length ? [{ ...group, quantity: 1, productIds }] : [];
  });
}
