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
} | null>(null);

export function AppPageHeaderProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const value = useMemo(() => ({ target, setTarget }), [target]);
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
