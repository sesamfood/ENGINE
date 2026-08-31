import { OrganizationAuthGate } from "@/components/catalog/organization-auth-gate";
import { GoodsReceiptHeader } from "@/components/goods-receipts/goods-receipt-header";

export default function GoodsReceiptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-20">
      <OrganizationAuthGate>
        <GoodsReceiptHeader>{children}</GoodsReceiptHeader>
      </OrganizationAuthGate>
    </section>
  );
}
