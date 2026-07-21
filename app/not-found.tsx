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
    <Empty className="mx-auto min-h-80 w-full max-w-[96rem] border">
      <EmptyHeader>
        <EmptyTitle>Siden blev ikke fundet</EmptyTitle>
        <EmptyDescription>
          Siden findes ikke eller er blevet fjernet.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href="/transfers" className={buttonVariants()}>
          Gå til overførsler
        </Link>
      </EmptyContent>
    </Empty>
  );
}
