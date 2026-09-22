import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function NotFound() {
  return (
    <Empty appearance="outlined" className="mx-auto min-h-80 w-full max-w-(--container-page)">
      <EmptyHeader>
        <EmptyTitle>Siden blev ikke fundet</EmptyTitle>
        <EmptyDescription>
          Siden findes ikke eller er blevet fjernet.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/transfers" className={buttonVariants()}>
          Gå til Transfer
        </Link>
      </EmptyContent>
    </Empty>
  );
}
