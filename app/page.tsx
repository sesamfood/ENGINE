"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHomeDestination } from "@/components/app-shell";
import { Spinner } from "@/components/ui/spinner";

export default function Home() {
  const router = useRouter();
  const destination = useHomeDestination();
  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);
  return (
    <main
      className="grid min-h-80 place-items-center"
      aria-label="Åbner startside"
    >
      <Spinner />
    </main>
  );
}
