import { ExpenseSettings } from "@/components/organization/expense-settings";
import { FeatureToggle } from "@/components/organization/feature-toggle";

export default function AdministrationExpensesPage() {
  return (
    <div className="flex flex-col gap-6">
      <FeatureToggle feature="expenses" />
      <ExpenseSettings />
    </div>
  );
}
