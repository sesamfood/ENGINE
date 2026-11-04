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
  sectionTarget: HTMLDivElement | null;
  setSectionTarget: (target: HTMLDivElement | null) => void;
} | null>(null);

export function AppPageHeaderProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const [sectionTarget, setSectionTarget] =
    useState<HTMLDivElement | null>(null);
  const value = useMemo(
    () => ({ target, setTarget, sectionTarget, setSectionTarget }),
    [sectionTarget, target],
  );
  return (
    <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>
  );
}

export function AppSectionNavTarget() {
  const context = useContext(HeaderContext);
  return (
    <div ref={context?.setSectionTarget} className="px-4 empty:hidden" />
  );
}

export function AppSectionNav({ children }: { children: ReactNode }) {
  const context = useContext(HeaderContext);
  if (!context?.sectionTarget) return null;
  return createPortal(children, context.sectionTarget);
}

export function AppPageHeaderTarget() {
  const context = useContext(HeaderContext);
  return (
    <div ref={context?.setTarget} className="hidden min-w-0 flex-1 md:block" />
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
  return <header className={cn("md:hidden", className)}>{children}</header>;
}
