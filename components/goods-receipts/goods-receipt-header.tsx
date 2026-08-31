"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function HeaderContent() {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold uppercase tracking-widest text-primary">
        Varemodtagelse
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Varemodtagelse
      </h1>
    </div>
  );
}

export function GoodsReceiptHeader() {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTarget(document.getElementById("goods-receipts-shell-header"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <>
      <header className="md:hidden">
        <HeaderContent />
      </header>
      {target ? createPortal(<HeaderContent />, target) : null}
    </>
  );
}
