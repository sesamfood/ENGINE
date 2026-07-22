import { StoreIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-muted/40 p-4 sm:p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <StoreIcon aria-hidden="true" />
        </div>
        <Card className="w-full [--card-spacing:--spacing(6)]">
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
          {footer ? <CardFooter className="justify-center">{footer}</CardFooter> : null}
        </Card>
      </div>
    </main>
  );
}
