import { CountNavigation } from "@/components/count/count-navigation";
import { LocationStock } from "@/components/count/location-stock";

export default function LocationStockPage() {
  return (
    <div className="pb-24">
      <LocationStock />
      <CountNavigation />
    </div>
  );
}
