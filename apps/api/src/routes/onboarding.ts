import type { FastifyPluginAsync } from "fastify";

export const onboardingRouter: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: { code?: string; embedded?: boolean; phoneNumberId?: string; wabaId?: string };
  }>("/waba-callback", async (request, reply) => {
    const { code, embedded, phoneNumberId, wabaId } = request.body;
    if (!code) return reply.status(400).send({ error: "code required" });

    const { organizationId } = request.auth;

    const appId = process.env["META_APP_ID"] ?? "";
    const appSecret = process.env["META_APP_SECRET"] ?? "";

    const params = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
    if (!embedded) params.set("redirect_uri", process.env["META_REDIRECT_URI"] ?? "");

    const metaUrl = `https://graph.facebook.com/v22.0/oauth/access_token?${params.toString()}`;
    const tokenRes = await fetch(metaUrl);
    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({})) as object;
      fastify.log.error({ metaError: errBody }, "Meta OAuth token exchange failed");
      return reply.status(502).send({ error: "meta_oauth_failed", detail: errBody });
    }
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Determine onboarding step based on what the embedded signup captured
    const hasPhone = embedded && !!phoneNumberId;
    const onboardingStep = hasPhone ? "done" : "provision_number";

    await fastify.prisma.organization.update({
      where: { id: organizationId },
      data: {
        wabaAccessToken: access_token,
        onboardingStep,
        ...(phoneNumberId ? { phoneNumberId } : {}),
        ...(wabaId ? { whatsappBusinessAccountId: wabaId } : {}),
      },
    });

    return reply.send({ success: true, phoneNumberId, wabaId });
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
