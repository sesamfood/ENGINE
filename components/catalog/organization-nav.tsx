"use client";

import { usePathname, useRouter } from "next/navigation";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = [
  { value: "products", label: "Products" },
  { value: "categories", label: "Categories" },
  { value: "units", label: "Units" },
];

export function OrganizationNav() {
  const pathname = usePathname();
  const router = useRouter();
  const section =
    sections.find((item) => pathname.startsWith(`/organization/${item.value}`))
      ?.value ?? "products";

  return (
    <Tabs
      value={section}
      onValueChange={(value) => router.push(`/organization/${value}`)}
    >
      <TabsList className="h-11 w-full justify-start overflow-x-auto rounded-xl p-1 sm:w-fit">
        {sections.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="min-w-28 px-5"
          >
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
