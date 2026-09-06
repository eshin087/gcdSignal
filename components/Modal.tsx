"use client";

import { useDialog } from "@/lib/use-dialog";
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
  const ref = useDialog(open);

  if (!open) return null;

  return (
    <dialog ref={ref} className="app-modal" aria-label={title} onCancel={onClose} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
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
    </dialog>
  );
}
