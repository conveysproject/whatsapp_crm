// Pure helper: a contact's closure deadline = creation date + N days.
export function computeClosureDeadline(createdAt: Date, days: number): Date {
  return new Date(createdAt.getTime() + days * 86_400_000);
}
