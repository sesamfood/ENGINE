import { notFound } from "next/navigation";
import { FoodSafetyDetail } from "@/components/food-safety/food-safety-detail";
import { addDateKey } from "@/lib/food-safety";

export default async function FoodSafetyPage({ params, searchParams }: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ locationId?: string | string[]; date?: string | string[] }>;
}) {
  const { templateId } = await params;
  const { locationId, date } = await searchParams;
  if (typeof locationId !== "string" || typeof date !== "string") notFound();
  try {
    addDateKey(date, 0);
  } catch {
    notFound();
  }
  return <FoodSafetyDetail templateId={templateId} locationId={locationId} dateKey={date} />;
}
