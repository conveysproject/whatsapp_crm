/** Shared display helpers (moved from duplicated copies in components/analytics). */

/** Seconds -> "45s", "2m 5s", "1h 5m". Null or 0 -> "—". */
export function formatDuration(secs: number | null): string {
  if (secs === null || secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

/** Variant used by TeamLeaderboard: no seconds above one minute (kept so its output is unchanged). */
export function formatDurationCoarse(secs: number): string {
  if (secs === 0) return "—";
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Period-over-period change; text is the magnitude (the UI shows direction from `up`). `up` is null when there is no change or no data. */
export function formatDelta(pct: number | null): { text: string; up: boolean | null } {
  if (pct === null || !Number.isFinite(pct)) return { text: "—", up: null };
  const r = Math.round(pct * 10) / 10;
  if (r === 0) return { text: "0%", up: null };
  return { text: `${Math.abs(r)}%`, up: r > 0 };
}
