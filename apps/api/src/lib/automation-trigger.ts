import type { PrismaClient } from "@prisma/client";

/**
 * Returns true if `now` falls within any BusinessHours slot for the org.
 * Uses org's timezone stored in `Organization.settings.timezone` (defaults to UTC).
 * Compares local wall-clock time in that timezone against each slot's HH:MM range.
 */
export async function isWithinBusinessHours(
  prisma: PrismaClient,
  organizationId: string,
  now: Date = new Date()
): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });

  const settings = (org?.settings ?? {}) as Record<string, unknown>;
  const timezone = typeof settings["timezone"] === "string" ? settings["timezone"] : "UTC";

  const slots = await prisma.businessHours.findMany({
    where: { organizationId },
  });

  if (slots.length === 0) return false;

  // Get current local HH:MM in the org timezone
  let localHour: number;
  let localMinute: number;
  let localDayOfWeek: number;

  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hour12: false,
      timeZone: timezone,
    });
    const parts = formatter.formatToParts(now);
    localHour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
    localMinute = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);

    // Get day of week (0=Sun…6=Sat) using a locale-independent approach
    const dayFormatter = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      timeZone: timezone,
    });
    const dayStr = dayFormatter.format(now);
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    localDayOfWeek = dayMap[dayStr] ?? now.getDay();
  } catch {
    // Fallback to UTC if timezone is invalid
    localHour = now.getUTCHours();
    localMinute = now.getUTCMinutes();
    localDayOfWeek = now.getUTCDay();
  }

  const currentMinutes = localHour * 60 + localMinute;

  return slots.some((slot) => {
    if (slot.dayOfWeek !== localDayOfWeek) return false;
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    const startMinutes = (sh ?? 0) * 60 + (sm ?? 0);
    const endMinutes = (eh ?? 0) * 60 + (em ?? 0);
    // Normal range (e.g. 09:00–18:00); end-midnight is handled as exclusive
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  });
}
