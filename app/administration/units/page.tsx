import { UnitMigration } from "@/components/catalog/unit-migration";
import { VocabularyManager } from "@/components/catalog/vocabulary-manager";

export default function AdministrationUnitsPage() {
  return (
    <div className="flex flex-col gap-7">
      <UnitMigration />
      <VocabularyManager kind="unit" />
    </div>
  );
}
