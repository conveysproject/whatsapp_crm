// Pure planning logic for scripts/import-auth-accounts.ts (own-auth cutover, PRD §6.1).
// One auth_accounts row per non-deleted users row: id = users.id, normalized email marked verified,
// no password, must_set_password = true. Nothing is overwritten; conflicts are reported, not guessed.

export interface UserRow {
  id: string;
  email: string;
  fullName: string;
  deletedAt: Date | null;
}

export interface ExistingAccount {
  id: string;
  email: string;
}

export interface PlannedAccount {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ImportPlan {
  create: PlannedAccount[];
  alreadyImported: string[]; // user ids that already have an auth account with the same id
  skippedDeleted: string[];
  conflicts: Array<{ userId: string; reason: "duplicate_email_in_users" | "email_taken_by_other_account" | "empty_email" }>;
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  return { firstName: parts[0] ?? null, lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

export function planImport(users: UserRow[], existing: ExistingAccount[]): ImportPlan {
  const plan: ImportPlan = { create: [], alreadyImported: [], skippedDeleted: [], conflicts: [] };
  const existingById = new Map(existing.map((a) => [a.id, a]));
  const existingByEmail = new Map(existing.map((a) => [normalizeEmail(a.email), a]));

  const live = users.filter((u) => {
    if (u.deletedAt) plan.skippedDeleted.push(u.id);
    return !u.deletedAt;
  });

  const emailCounts = new Map<string, number>();
  for (const u of live) {
    const e = normalizeEmail(u.email);
    emailCounts.set(e, (emailCounts.get(e) ?? 0) + 1);
  }

  for (const u of live) {
    const email = normalizeEmail(u.email);
    if (existingById.has(u.id)) {
      plan.alreadyImported.push(u.id);
      continue;
    }
    if (!email) {
      plan.conflicts.push({ userId: u.id, reason: "empty_email" });
      continue;
    }
    if ((emailCounts.get(email) ?? 0) > 1) {
      plan.conflicts.push({ userId: u.id, reason: "duplicate_email_in_users" });
      continue;
    }
    if (existingByEmail.has(email)) {
      plan.conflicts.push({ userId: u.id, reason: "email_taken_by_other_account" });
      continue;
    }
    plan.create.push({ id: u.id, email, ...splitName(u.fullName) });
  }
  return plan;
}

export function parseArgs(argv: string[]): { apply: boolean } {
  return { apply: argv.includes("--apply") };
}
