import type { FastifyPluginAsync } from "fastify";
import { Webhook } from "svix";
import { seedLeadStatuses } from "../lib/seed-lead-statuses.js";
import { seedDefaultPipeline } from "../lib/seed-default-pipeline.js";

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

interface ClerkSession {
  user_id: string;
  client_id?: string;
}

interface ClerkUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email_addresses: Array<{ email_address: string; id: string }>;
  primary_email_address_id: string | null;
  deleted?: boolean;
}

type ClerkEvent =
  | { type: "organization.created"; data: ClerkOrg }
  | { type: "organizationMembership.created"; data: ClerkMembership }
  | { type: "organizationMembership.deleted"; data: ClerkMembership }
  | { type: "session.created"; data: ClerkSession }
  | { type: "user.updated"; data: ClerkUser }
  | { type: "user.deleted"; data: { id: string } }
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
        await seedLeadStatuses(fastify.prisma, org.id);
        await seedDefaultPipeline(fastify.prisma, org.id);
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
          .join(" ") || "";
        // Role comes from our invitation flow, never from Clerk's org role.
        // `agent` is the safety-net default, but the org creator is always admin.
        void role; // Clerk org role intentionally ignored
        const dbRole = userId === organization.created_by ? "admin" : "agent";

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
          // Only set role from a pending invitation on update. Never apply the
          // `agent` default to an existing user — that would demote an admin who
          // registered via /register when this membership event later fires.
          update: { isActive: true, email, fullName, ...(invitation ? { role: invitation.role } : {}) },
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

      if (event.type === "user.updated") {
        const u = event.data as ClerkUser;
        const primary = u.email_addresses.find((e) => e.id === u.primary_email_address_id);
        const email = primary?.email_address ?? u.email_addresses[0]?.email_address;
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(" ") || undefined;
        await fastify.prisma.user.updateMany({
          where: { id: u.id },
          data: {
            ...(email ? { email } : {}),
            ...(fullName ? { fullName } : {}),
          },
        });
      }

      if (event.type === "user.deleted") {
        const { id } = event.data as { id: string };
        await fastify.prisma.user.updateMany({
          where: { id },
          data: { isActive: false, deletedAt: new Date() },
        });
      }

      // Stamp lastSignInAt and write login audit log on session creation
      if (event.type === "session.created") {
        const session = event.data as ClerkSession;
        const now = new Date();
        const user = await fastify.prisma.user.findUnique({
          where: { id: session.user_id },
          select: { organizationId: true },
        });
        if (user) {
          await Promise.all([
            fastify.prisma.user.update({
              where: { id: session.user_id },
              data: { lastSignInAt: now },
            }),
            fastify.prisma.loginLog.create({
              data: {
                userId: session.user_id,
                orgId: user.organizationId,
                ipAddress: request.ip ?? null,
                userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
                success: true,
              },
            }),
          ]);
        }
      }

      return reply.status(200).send({ ok: true });
    }
  );
};
