"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const HeaderContext = createContext<{
  target: HTMLDivElement | null;
  setTarget: (target: HTMLDivElement | null) => void;
  mobileTarget: HTMLDivElement | null;
  setMobileTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

export function AppPageHeaderProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [mobileTarget, setMobileTarget] =
    useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => ({
      target,
      setTarget,
      mobileTarget,
      setMobileTarget,
    }),
    [mobileTarget, target],
  );
  return (
    <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>
  );
}

export function AppPageHeaderTarget() {
  const context = useContext(HeaderContext);
  return (
    <div ref={context?.setTarget} className="hidden min-w-0 flex-1 md:block" />
  );
}

export function AppMobilePageHeaderTarget() {
  const context = useContext(HeaderContext);
  return (
    <div
      ref={context?.setMobileTarget}
      className="px-4 pt-4 empty:hidden md:hidden"
    />
  );
}

export function PageTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={cn(
        "text-3xl font-semibold tracking-tight sm:text-4xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function AppPageHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const context = useContext(HeaderContext);
  const isMobile = useIsMobile();
  if (!isMobile && context?.target)
    return createPortal(children, context.target);
  if (isMobile && context?.mobileTarget)
    return createPortal(
      <header className={className}>{children}</header>,
      context.mobileTarget,
    );
  return <header className={cn("md:hidden", className)}>{children}</header>;
}
