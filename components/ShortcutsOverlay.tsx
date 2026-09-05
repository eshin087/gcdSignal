"use client";

import { SHORTCUTS } from "@/lib/use-hotkeys";
import Modal from "./Modal";

export default function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <ul className="space-y-1.5">
        {SHORTCUTS.map((s) => (
          <li key={s.keys} className="flex items-center gap-3 text-xs">
            <kbd className="min-w-[4.5rem] rounded-md border border-black/10 bg-black/[0.04] px-2 py-1 text-center font-mono text-[11px] font-semibold text-zinc-700 dark:border-white/15 dark:bg-white/[0.06] dark:text-zinc-200">
              {s.keys}
            </kbd>
            <span className="text-zinc-600 dark:text-zinc-300">{s.does}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[10px] text-zinc-400 dark:text-zinc-600">
        shortcuts are off while typing in a field
      </p>
    </Modal>
  );
}
