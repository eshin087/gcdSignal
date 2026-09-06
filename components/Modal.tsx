"use client";

import { useEffect } from "react";
import { XIcon } from "./icons";

export default function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-sm rounded-xl border border-black/10 bg-white/90 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-[#141416]/90"
      >
        <header className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-zinc-500 hover:bg-black/[0.05] dark:hover:bg-white/[0.06]"
          >
            <XIcon />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
