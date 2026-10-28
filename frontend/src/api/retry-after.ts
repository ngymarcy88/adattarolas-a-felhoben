export function readRetryAfter(header: string | null): number {
  if (!header) return 60_000;
  const delay = /^\d+$/.test(header) ? Number(header) * 1000 : Math.max(0, Date.parse(header) - Date.now());
  return Number.isSafeInteger(delay) && delay >= 0 && delay <= Number.MAX_SAFE_INTEGER - Date.now() ? delay : 60_000;
}
