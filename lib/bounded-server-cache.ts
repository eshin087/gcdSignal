/**
 * Byte-budgeted LRU for JSON-shaped server data. Limits serialized bytes, not
 * an exact V8 heap measurement; objects may use more memory than their JSON.
 */
export class BoundedServerCache<T> {
  private entries = new Map<string, { value: T; expires: number; bytes: number }>();
  private bytes = 0;
  constructor(
    private readonly maxEntries = 200,
    private readonly maxBytes = 8 * 1024 * 1024,
    private readonly maxEntryBytes = 1024 * 1024,
  ) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) { this.remove(key); return undefined; }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T, ttlMs: number): boolean {
    let bytes: number;
    try {
      const serialized = JSON.stringify(value);
      if (serialized === undefined) return false;
      bytes = Buffer.byteLength(serialized) + Buffer.byteLength(key);
    } catch { return false; }
    if (bytes > this.maxEntryBytes || bytes > this.maxBytes) return false;
    for (const [oldKey, entry] of this.entries) if (entry.expires <= Date.now()) this.remove(oldKey);
    this.remove(key);
    while (this.entries.size >= this.maxEntries || this.bytes + bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return false;
      this.remove(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + ttlMs, bytes });
    this.bytes += bytes;
    return true;
  }
  get stats() { return { entries: this.entries.size, serializedBytes: this.bytes }; }
  private remove(key: string) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.entries.delete(key);
  }
}
