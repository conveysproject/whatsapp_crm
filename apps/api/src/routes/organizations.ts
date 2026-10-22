import type { FastifyPluginAsync } from "fastify";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { PROFILE_FIELDS, PROFILE_MAX_LENGTH, normalizeProfileField, type ProfileField } from "../lib/org-profile.js";

// Keys managed server-side only — never overwritable via PATCH /organizations/me
const PROTECTED_SETTINGS_KEYS = new Set([
  "stripeCustomerId",
  "wabaAccessToken",
  "whatsappBusinessAccountId",
]);

// Explicit select: never return wabaAccessToken or stripeId to the browser.
export const ORG_PUBLIC_SELECT = {
  id: true,
  name: true,
  planTier: true,
  whatsappBusinessAccountId: true,
  phoneNumberId: true,
  onboardingStep: true,
  phone: true,
  website: true,
  location: true,
  industry: true,
  subCategory: true,
  revenue: true,
  whatsappUpdates: true,
  facebookPageId: true,
  instagramAccountId: true,
  metaBusinessId: true,
  registeredAt: true,
  settings: true,
  createdAt: true,
  updatedAt: true,
  slug: true,
  domain: true,
  logoImage: true,
  smallLogoImage: true,
  favicon: true,
  darkLogoImage: true,
  darkSmallLogoImage: true,
  darkFavicon: true,
  orgType: true,
  status: true,
  banReason: true,
  trialEndsAt: true,
} as const;

export const organizationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/organizations/me", async (request) => {
    const { isParent, parentOrganizationId, ...org } = await prisma.organization.findUniqueOrThrow({
      where: { id: request.auth.organizationId },
      select: { ...ORG_PUBLIC_SELECT, isParent: true, parentOrganizationId: true },
    });
    // Parent/child flags for the web nav and settings. The parent's id is never returned.
    return {
      data: {
        ...org,
        isParent: isParent === true && parentOrganizationId === null,
        hasParent: parentOrganizationId !== null,
      },
    };
  });

  fastify.patch<{ Body: { name?: string; settings?: Record<string, unknown> } & Partial<Record<ProfileField, string | null>> }>(
    "/organizations/me",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 255 },
            settings: { type: "object" },
            ...Object.fromEntries(PROFILE_FIELDS.map((f) => [f, { type: ["string", "null"], maxLength: PROFILE_MAX_LENGTH[f] }])),
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      if (request.auth.role !== "admin" && request.auth.role !== "manager") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Only admins and managers can update organization settings" } });
      }

      const profileUpdate: Partial<Record<ProfileField, string | null>> = {};
      for (const field of PROFILE_FIELDS) {
        if (request.body[field] === undefined) continue;
        const r = normalizeProfileField(field, request.body[field] ?? null);
        if (!r.ok) return reply.status(400).send({ error: { code: "INVALID_PROFILE", message: r.message } });
        profileUpdate[field] = r.value;
      }

      let settingsUpdate: Prisma.InputJsonValue | undefined;
      if (request.body.settings !== undefined) {
        const existing = await prisma.organization.findUnique({
          where: { id: request.auth.organizationId },
          select: { settings: true },
        });
        const current = (existing?.settings as Record<string, unknown>) ?? {};
        const incoming = request.body.settings;
        // Strip protected keys from the incoming patch, then merge over existing.
        // Nested plain-object values (e.g. contactConfig) are merged one level deep so
        // that updating one sub-key (e.g. assignmentFallbackEnabled) does not clobber
        // sibling sub-keys written by other settings sections (e.g. defaultLeadStatusId).
        const isPlainObject = (v: unknown): v is Record<string, unknown> =>
          typeof v === "object" && v !== null && !Array.isArray(v);
        const merged: Record<string, unknown> = { ...current };
        for (const [k, v] of Object.entries(incoming)) {
          if (PROTECTED_SETTINGS_KEYS.has(k)) continue;
          merged[k] = isPlainObject(v) && isPlainObject(current[k])
            ? { ...(current[k] as Record<string, unknown>), ...v }
            : v;
        }
        settingsUpdate = merged as Prisma.InputJsonValue;
      }

      const org = await prisma.organization.update({
        where: { id: request.auth.organizationId },
        data: {
          name: request.body.name,
          settings: settingsUpdate,
          ...profileUpdate,
        },
        select: ORG_PUBLIC_SELECT,
      });
      return { data: org };
    }
  );

  const brandingFields: Record<string, string> = {
    logo: "logoImage",
    "small-logo": "smallLogoImage",
    favicon: "favicon",
    "dark-logo": "darkLogoImage",
    "dark-favicon": "darkFavicon",
  };

  for (const [slug, field] of Object.entries(brandingFields)) {
    // Retired: assets are uploaded through /organizations/brand/assets/:slot (type checked, org scoped, audited).
    fastify.post(`/organizations/branding/${slug}`, async (_request, reply) =>
      reply.status(410).send({ error: { code: "GONE", message: "Use /v1/organizations/brand/assets/:slot" } })
    );
  }
};
