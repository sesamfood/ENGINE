"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const sections = [
  { value: "products", label: "Products" },
  { value: "categories", label: "Categories" },
  { value: "units", label: "Units" },
];

export function OrganizationHeader() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const item of sections) {
      router.prefetch(`/organization/${item.value}`);
    }
  }, [router]);

  if (pathname.startsWith("/organization/products/")) return null;

  const section =
    sections.find((item) => pathname.startsWith(`/organization/${item.value}`))
      ?.value ?? "products";

  return (
    <>
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Organization
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Catalog management
        </h1>
      </header>
      <Tabs
        value={section}
        onValueChange={(value) =>
          router.push(`/organization/${value}`, { scroll: false })
        }
      >
        <TabsList
          aria-label="Catalog sections"
          className="h-14 w-full justify-start overflow-x-auto"
        >
          {sections.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="min-w-36 px-6"
            >
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </>
  );
}
