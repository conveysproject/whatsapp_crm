/**
 * Strict argument parser for scripts/recompute-message-usage.ts. No I/O.
 * Accepts exactly: --from YYYY-MM-DD --to YYYY-MM-DD [--apply]. Anything else throws a "Usage:" error.
 */
const USAGE = "Usage: recompute-message-usage --from YYYY-MM-DD --to YYYY-MM-DD [--apply]";
const MAX_DAYS = 62;
const DAY_MS = 86_400_000;

function fail(reason: string): never {
  throw new Error(`${USAGE} (${reason})`);
}

function parseDay(value: string, flag: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) fail(`${flag} must be YYYY-MM-DD`);
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) fail(`${flag} is not a real date`);
  return date;
}

export function parseMeteringArgs(argv: string[], today: Date = new Date()): { from: Date; to: Date; apply: boolean } {
  let fromRaw: string | undefined;
  let toRaw: string | undefined;
  let apply = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--from" || a === "--to") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) fail(`${a} needs a value`);
      if (a === "--from") {
        if (fromRaw !== undefined) fail("--from given twice");
        fromRaw = v;
      } else {
        if (toRaw !== undefined) fail("--to given twice");
        toRaw = v;
      }
      i++;
    } else if (a === "--apply") {
      if (apply) fail("--apply given twice");
      apply = true;
    } else {
      fail(`unexpected argument ${a.startsWith("-") ? "flag" : "value"}`);
    }
  }
  if (fromRaw === undefined || toRaw === undefined) fail("--from and --to are required");
  const from = parseDay(fromRaw, "--from");
  const to = parseDay(toRaw, "--to");
  if (from > to) fail("--from must not be after --to");
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (to > todayUtc) fail("--to must not be after today (UTC)");
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (days > MAX_DAYS) fail(`range is limited to ${MAX_DAYS} days`);
  return { from, to, apply };
}
