import type { FastifyPluginAsync } from "fastify";
import { Webhook } from "svix";

interface ClerkOrg {
  id: string;
  name: string;
  slug: string | null;
  created_by: string;
}

interface ClerkPublicUserData {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  identifier?: string; // primary email on membership events
  email_addresses?: Array<{ email_address: string; id: string }>;
}

interface ClerkMembership {
  organization: ClerkOrg;
  public_user_data: ClerkPublicUserData;
  role: string; // "org:admin" | "org:member"
}

type ClerkEvent =
  | { type: "organization.created"; data: ClerkOrg }
  | { type: "organizationMembership.created"; data: ClerkMembership }
  | { type: "organizationMembership.deleted"; data: ClerkMembership }
  | { type: string; data: unknown };

export const clerkWebhookRouter: FastifyPluginAsync = async (fastify) => {
  // Capture raw body as Buffer so Svix can verify the signature
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => done(null, body)
  );

  fastify.post<{ Body: Buffer }>(
    "/webhooks/clerk",
    { config: { public: true } },
    async (request, reply) => {
      const svixId = request.headers["svix-id"] as string | undefined;
      const svixTs = request.headers["svix-timestamp"] as string | undefined;
      const svixSig = request.headers["svix-signature"] as string | undefined;

      const rawBody = request.body as Buffer;
      const webhookSecret = process.env["CLERK_WEBHOOK_SECRET"] ?? "";

      if (webhookSecret && svixId && svixTs && svixSig) {
        try {
          const wh = new Webhook(webhookSecret);
          wh.verify(rawBody, {
            "svix-id": svixId,
            "svix-timestamp": svixTs,
            "svix-signature": svixSig,
          });
        } catch {
          return reply.status(400).send({ error: "Invalid webhook signature" });
        }
      }

      let event: ClerkEvent;
      try {
        event = JSON.parse(rawBody.toString()) as ClerkEvent;
      } catch {
        return reply.status(400).send({ error: "Invalid JSON body" });
      }

      fastify.log.info({ type: event.type }, "Clerk webhook received");

      if (event.type === "organization.created") {
        const org = event.data as ClerkOrg;
        await fastify.prisma.organization.upsert({
          where: { id: org.id },
          create: { id: org.id, name: org.name || "My Organization" },
          update: { name: org.name || "My Organization" },
        });
        fastify.log.info({ orgId: org.id }, "Organization provisioned");
      }

      if (event.type === "organizationMembership.created") {
        const { organization, public_user_data, role } = event.data as ClerkMembership;
        const userId = public_user_data.user_id;
        const email =
          public_user_data.identifier ??
          public_user_data.email_addresses?.[0]?.email_address ??
          "";
        const fullName = [
          public_user_data.first_name,
          public_user_data.last_name,
        ]
          .filter(Boolean)
          .join(" ") || null;
        const dbRole =
          role === "org:admin" ? "admin" : "agent";

        // Ensure org exists (may arrive before organization.created)
        await fastify.prisma.organization.upsert({
          where: { id: organization.id },
          create: { id: organization.id, name: organization.name || "My Organization" },
          update: {},
        });

        // Check if this user accepted an invitation (use its role)
        const invitation = await fastify.prisma.invitation.findFirst({
          where: { organizationId: organization.id, email, status: "pending" },
          orderBy: { createdAt: "desc" },
        });

        await fastify.prisma.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            organizationId: organization.id,
            email,
            fullName,
            role: invitation ? invitation.role : dbRole,
            isActive: true,
          },
          update: { isActive: true, email, fullName },
        });

        if (invitation) {
          await fastify.prisma.invitation.update({
            where: { id: invitation.id },
            data: { status: "accepted" },
          });
        }

        fastify.log.info({ userId, orgId: organization.id }, "User provisioned");
      }

      if (event.type === "organizationMembership.deleted") {
        const { public_user_data } = event.data as ClerkMembership;
        await fastify.prisma.user.updateMany({
          where: { id: public_user_data.user_id },
          data: { isActive: false },
        });
      }

      return reply.status(200).send({ ok: true });
    }
  );
};
