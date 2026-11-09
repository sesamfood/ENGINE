"use client";

import { useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function DraftRestoredNotice({
  description,
  onDiscard,
}: {
  description: string;
  onDiscard: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <Alert>
        <AlertTitle>Kladde gendannet</AlertTitle>
        <AlertDescription>{description}</AlertDescription>
        <AlertAction>
          <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
            Kassér kladde
          </Button>
        </AlertAction>
      </Alert>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kassér kladde?</AlertDialogTitle>
            <AlertDialogDescription>
              Det, du har indtastet, bliver fjernet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Behold kladde</AlertDialogCancel>
            <AlertDialogAction onClick={onDiscard}>Kassér kladde</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
