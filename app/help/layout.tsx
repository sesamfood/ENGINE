import type { ReactNode } from "react";
import { HelpShell } from "@/components/help/help-shell";
import { OrganizationTheme } from "@/components/organization/organization-theme";

export default function HelpLayout({ children }: { children: ReactNode }) {
  return (
    <OrganizationTheme>
      <HelpShell>{children}</HelpShell>
    </OrganizationTheme>
  );
}
