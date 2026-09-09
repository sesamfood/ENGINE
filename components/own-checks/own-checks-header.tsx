"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function OwnChecksHeader() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setTarget(document.getElementById("own-checks-shell-header")),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  const title = (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Fødevaresikkerhed
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Egenkontrol
      </h1>
    </div>
  );

  return (
    <>
      <header className="md:hidden">{title}</header>
      {target ? createPortal(title, target) : null}
    </>
  );
}
