"use client";

import { useRef, useState } from "react";
import { useDialog } from "@/lib/use-dialog";
import { exportReadingQueue, importReadingQueue, READING_QUEUE_BACKUP_LIMIT, removeFromReadingQueue, retryReadingQueueStorage, useReadingQueue } from "@/lib/reading-queue";
import { XIcon } from "./icons";

export default function ReadingQueue({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useDialog(open);
  const file = useRef<HTMLInputElement>(null);
  const { items, warning, ready } = useReadingQueue();
  const [notice, setNotice] = useState("");
  const [importing, setImporting] = useState(false);

  const download = () => {
    try {
      const backup = exportReadingQueue();
      const url = URL.createObjectURL(new Blob([backup.data], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url; link.download = backup.recovery ? "signal-must-read-recovery.json" : "signal-must-read-backup.json";
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(backup.recovery
        ? "Recovery backup exported from the items visible in this tab. It may not include the unreadable stored queue."
        : "Queue backup exported. Library saves and X bookmarks have their own backups.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not export the current queue. Retry storage first.");
    }
  };
  const importFile = async (selected: File) => {
    if (selected.size > READING_QUEUE_BACKUP_LIMIT) { setNotice("Choose a queue backup smaller than 2 MB. Nothing was changed."); return; }
    setImporting(true);
    try {
      const result = importReadingQueue(await selected.text());
      setNotice(result.ok ? `${result.added} ${result.added === 1 ? "item" : "items"} added. Existing queued items were kept.` : result.error ?? "Could not import this backup.");
    } catch { setNotice("Could not read the backup file. Nothing was changed."); }
    finally { setImporting(false); }
  };

  return <dialog ref={dialog} className="reader-dialog" aria-label="Must read queue" onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
        <div><h2 className="text-lg font-semibold">Must read <span className="font-normal text-zinc-500">{ready ? `· ${items.length}` : ""}</span></h2><p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">One short list, from every column. Oldest additions first.</p></div>
        <button className="reader-icon flex shrink-0 items-center justify-center" aria-label="Close Must read queue" onClick={onClose}><XIcon className="h-5 w-5" /></button>
      </header>
      <div className="feed-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5">
        {warning && <div role="alert" className="border-b border-amber-200 py-3 text-sm text-amber-800 dark:border-amber-900 dark:text-amber-200"><p>{warning}</p><button className="action-button mt-2" onClick={() => { const saved = retryReadingQueueStorage(); setNotice(saved ? "Queue storage is working. Your changes are saved." : "Storage is still unavailable. Export a recovery backup of the visible items before closing this tab."); }}>Retry storage</button></div>}
        {!ready ? <p className="py-10 text-sm text-zinc-500">Loading your queue…</p> : !items.length ? <div className="py-12"><h3 className="font-medium">Nothing waiting. A clear place to start.</h3><p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">Open a story’s Details and choose Add to Must read. News, research, and X posts will meet here.</p></div> : <ol className="divide-y divide-zinc-200 dark:divide-zinc-800">{items.map((item, index) => <li key={item.id} className="flex items-start gap-3 py-4">
          <div className="min-w-0 flex-1"><a href={item.url} target="_blank" rel="noopener noreferrer" className="block min-h-11 break-words text-[length:var(--fs-title)] font-medium leading-snug text-zinc-900 hover:text-teal-700 dark:text-zinc-100 dark:hover:text-teal-300">{item.title}</a><p className="mt-1 break-words text-xs text-zinc-600 dark:text-zinc-400">{item.source}</p></div>
          <button data-queue-done className="min-h-11 min-w-11 shrink-0 px-2 text-xs text-zinc-600 hover:text-teal-700 dark:text-zinc-400 dark:hover:text-teal-300" aria-label={`Done item ${index + 1}: ${item.title} · ${item.source}`} title="Remove from this queue only" onClick={(event) => {
            const controls = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button[data-queue-done]") ?? [])];
            const index = controls.indexOf(event.currentTarget);
            removeFromReadingQueue(item.id);
            setNotice("Done. Removed from this queue only; saved items are unchanged.");
            requestAnimationFrame(() => {
              const remaining = [...(dialog.current?.querySelectorAll<HTMLButtonElement>("button[data-queue-done]") ?? [])];
              (remaining[index] ?? remaining[index - 1] ?? dialog.current?.querySelector<HTMLButtonElement>('[aria-label="Close Must read queue"]'))?.focus();
            });
          }}>Done</button>
        </li>)}</ol>}
      </div>
      <footer className="shrink-0 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <p role="status" className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{notice || "Stored in this browser only, separately from Library saves and X bookmarks. Opening a link keeps it queued; Done removes it."}</p>
        <div className="mt-2 flex flex-wrap gap-2"><button className="action-button" disabled={!ready} onClick={download}>Export queue</button><button className="action-button" disabled={!ready || importing} onClick={() => file.current?.click()}>{importing ? "Importing…" : "Import queue"}</button></div>
        <input ref={file} type="file" accept=".json,application/json" className="hidden" aria-label="Import queue backup" onChange={(event) => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (selected) void importFile(selected); }} />
      </footer>
    </div>
  </dialog>;
}
