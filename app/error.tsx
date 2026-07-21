"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function ErrorPage({
  unstable_retry,
}: {
  unstable_retry: () => void;
}) {
  return (
    <Empty className="mx-auto min-h-80 w-full max-w-[96rem] border">
      <EmptyHeader>
        <EmptyTitle>Der opstod en fejl</EmptyTitle>
        <EmptyDescription>Siden kunne ikke indlæses.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={unstable_retry}>Prøv igen</Button>
      </EmptyContent>
    </Empty>
  );
}
