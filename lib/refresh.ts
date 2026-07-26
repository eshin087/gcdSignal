export const REFRESH_OPTIONS = [
  { label: "Off", ms: 0 },
  { label: "1m", ms: 60_000 },
  { label: "5m", ms: 300_000 },
  { label: "15m", ms: 900_000 },
  { label: "30m", ms: 1_800_000 },
] as const;

export const DEFAULT_REFRESH_MS = 300_000;

export const isValidRefreshMs = (n: unknown): n is number =>
  REFRESH_OPTIONS.some((o) => o.ms === n);
