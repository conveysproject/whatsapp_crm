// Resolve a CSV status value (name or id) to a valid leadStatusId, falling back to the batch default.
export function resolveLeadStatusId(
  csvText: string | null | undefined,
  nameToId: Map<string, string>,
  validIds: Set<string>,
  batchDefault: string | null,
): string | null {
  if (csvText) {
    const t = csvText.trim();
    const byName = nameToId.get(t.toLowerCase());
    if (byName) return byName;
    if (validIds.has(t)) return t;
  }
  if (batchDefault && validIds.has(batchDefault)) return batchDefault;
  return null;
}
