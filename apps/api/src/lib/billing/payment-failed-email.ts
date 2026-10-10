import type { PrismaClient } from "@prisma/client";
import { sendMail } from "../mail.js";

export async function notifyPaymentFailed(prisma: PrismaClient, organizationId: string, graceEndsAt: Date): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { organizationId, role: "admin", isActive: true },
      select: { email: true },
    });
    const to = admins.map((a) => a.email).filter(Boolean);
    if (to.length === 0) return;
    const until = graceEndsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    await sendMail({
      to,
      subject: "WBMSG: your last payment failed",
      html: `<p>We could not process your latest WBMSG subscription payment.</p>
<p>Please update your payment method in Settings &gt; Billing before <strong>${until}</strong> to keep your current plan. After that date your account moves to the Starter plan.</p>`,
    });
  } catch (err) {
    console.warn("[billing] payment-failed email not sent", err instanceof Error ? err.message : err);
  }
}
