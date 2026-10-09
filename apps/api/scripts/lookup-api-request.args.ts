import { userInfo } from "node:os";

export interface LookupArgs {
  org: string;
  reason: string;
  apiId?: string;
  sinceHours: number;
  showMeta: boolean;
  actor: string;
}

/** Value of `--name <value>`; undefined when absent. A flag present with no value (end of argv or next token is a flag) throws. */
function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith("--")) throw new Error(`${name} requires a value`);
  return v;
}

export function parseArgs(argv: string[]): LookupArgs {
  const org = flag(argv, "--org")?.trim();
  if (!org) throw new Error("--org <organizationId> is required");
  const reason = flag(argv, "--reason")?.trim();
  if (!reason || reason.length < 8) throw new Error("--reason \"<ticket or why>\" is required (at least 8 characters)");
  const apiId = flag(argv, "--api-id")?.trim();
  if (apiId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(apiId)) {
    throw new Error("--api-id must be a UUID (the api_id from the response)");
  }
  const sinceRaw = flag(argv, "--since-hours")?.trim();
  const sinceHours = sinceRaw === undefined ? 24 : /^\d+$/.test(sinceRaw) ? Number(sinceRaw) : NaN;
  if (!Number.isInteger(sinceHours) || sinceHours < 1 || sinceHours > 24 * 365) {
    throw new Error("--since-hours must be an integer between 1 and 8760");
  }
  return {
    org,
    reason,
    ...(apiId ? { apiId } : {}),
    sinceHours,
    showMeta: argv.includes("--show-meta"),
    actor: process.env["USERNAME"] ?? process.env["USER"] ?? userInfo().username,
  };
}
