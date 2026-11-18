import { TodayFoodSafety } from "@/components/food-safety/today-food-safety";

export default async function FoodSafetyPage({ searchParams }: {
  searchParams: Promise<{ locationId?: string | string[] }>;
}) {
  const { locationId } = await searchParams;
  return <TodayFoodSafety initialLocationId={typeof locationId === "string" ? locationId : undefined} />;
}
