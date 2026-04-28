import type { FastifyPluginAsync } from "fastify";

export const onboardingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: { code?: string } }>("/waba-callback", async (request, reply) => {
    const { code } = request.body;
    if (!code) return reply.status(400).send({ error: "code required" });

    const { organizationId } = request.auth;

    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env["META_APP_ID"] ?? ""}&client_secret=${process.env["META_APP_SECRET"] ?? ""}&redirect_uri=${encodeURIComponent(process.env["META_REDIRECT_URI"] ?? "")}&code=${code}`
    );
    if (!tokenRes.ok) return reply.status(502).send({ error: "meta_oauth_failed" });
    const { access_token } = await tokenRes.json() as { access_token: string };

    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: { wabaAccessToken: access_token, onboardingStep: "provision_number" },
    });

    return reply.send({ success: true });
  });

  fastify.get("/status", async (request, reply) => {
    const { organizationId } = request.auth;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { wabaAccessToken: true, phoneNumberId: true, onboardingStep: true },
    });
    return reply.send({
      wabaConnected: !!org?.wabaAccessToken,
      numberProvisioned: !!org?.phoneNumberId,
      onboardingStep: org?.onboardingStep ?? "connect_waba",
    });
  });
};
