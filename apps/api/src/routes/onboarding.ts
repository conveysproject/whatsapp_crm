import type { FastifyPluginAsync } from "fastify";
import { syncPhoneNumbers } from "../lib/whatsapp.js";

export const onboardingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.get("/status", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { wabaAccessToken: true, phoneNumberId: true, onboardingStep: true },
    });
    return reply.send({
      wabaConnected: !!org?.wabaAccessToken,
      numberProvisioned: !!org?.phoneNumberId || org?.onboardingStep === "done",
      onboardingStep: org?.onboardingStep ?? "connect_waba",
    });
  });

  // Called when user clicks "Number is ready" on the provision-number page.
  // Re-runs syncPhoneNumbers (in case fire-and-forget missed it) and marks onboarding done.
  fastify.post("/sync-phone", async (request, reply) => {
    const { organizationId } = request.auth;
    const phones = await syncPhoneNumbers(organizationId);
    if (phones.length > 0) {
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { onboardingStep: "done" },
      });
      return reply.send({ phoneNumberId: phones[0]!.id, displayPhoneNumber: phones[0]!.displayPhoneNumber });
    }
    // No phone numbers from Meta API — mark done anyway so the user isn't stuck,
    // but return a flag so the frontend can inform them.
    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: { onboardingStep: "done" },
    });
    return reply.send({ phoneNumberId: null, displayPhoneNumber: null });
  });
};
