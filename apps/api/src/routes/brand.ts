import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { writeAdminAudit } from "../lib/audit.js";
import { isAllowedAssetUrl, resolveBrand, validateBrandInput, validateSlug } from "../lib/brand.js";
import { canBeParent } from "../lib/parent-orgs.js";
import { deleteFromR2, R2_PUBLIC_URL, uploadToR2 } from "../lib/r2.js";

// Slot name (URL) -> organizations column. Logo-type slots take up to 1 MB, favicon slots 256 KB.
const SLOTS = {
  logo: { column: "logoImage", favicon: false },
  smallLogo: { column: "smallLogoImage", favicon: false },
  favicon: { column: "favicon", favicon: true },
  darkLogo: { column: "darkLogoImage", favicon: false },
  darkSmallLogo: { column: "darkSmallLogoImage", favicon: false },
  darkFavicon: { column: "darkFavicon", favicon: true },
} as const;
type Slot = keyof typeof SLOTS;
const SLOT_NAMES = Object.keys(SLOTS) as Slot[];

const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_FAVICON_BYTES = 256 * 1024;

const BRAND_FIELDS = {
  brandName: true,
  brandColor: true,
  brandSupportEmail: true,
  brandHidePoweredBy: true,
  whiteLabelEnabled: true,
  slug: true,
  logoImage: true,
  smallLogoImage: true,
  favicon: true,
  darkLogoImage: true,
  darkSmallLogoImage: true,
  darkFavicon: true,
} as const;

interface BrandSettingsRow {
  brandName: string | null;
  brandColor: string | null;
  brandSupportEmail: string | null;
  brandHidePoweredBy: boolean;
  whiteLabelEnabled: boolean;
  slug: string | null;
  logoImage: string | null;
  smallLogoImage: string | null;
  favicon: string | null;
  darkLogoImage: string | null;
  darkSmallLogoImage: string | null;
  darkFavicon: string | null;
}

/** The stored settings, as the settings page needs them. Never any id. */
function toSettings(o: BrandSettingsRow) {
  return {
    name: o.brandName,
    color: o.brandColor,
    supportEmail: o.brandSupportEmail,
    slug: o.slug,
    hidePoweredBy: o.brandHidePoweredBy,
    whiteLabelEnabled: o.whiteLabelEnabled,
    logoUrl: o.logoImage,
    smallLogoUrl: o.smallLogoImage,
    faviconUrl: o.favicon,
    darkLogoUrl: o.darkLogoImage,
    darkSmallLogoUrl: o.darkSmallLogoImage,
    darkFaviconUrl: o.darkFavicon,
  };
}

/** Magic-byte sniffing. The client's mimetype and filename are never trusted. */
export function detectImageType(buf: Buffer, allowIco: boolean): "image/png" | "image/jpeg" | "image/webp" | "image/x-icon" | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (allowIco && buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return "image/x-icon";
  return null;
}

// One body for a non-admin and a non-parent: the settings routes reveal nothing about the org.
const forbidden = (reply: FastifyReply) =>
  reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not available" } });

const validationFailed = (reply: FastifyReply, field: string, message: string) =>
  reply.status(400).send({ error: { code: "VALIDATION_FAILED", field, message } });

// The same body for every reason a public brand is not available (unknown, disabled, not a parent, incomplete, bad slug).
const publicNotFound = (reply: FastifyReply) =>
  reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });

const slotParams = {
  type: "object",
  properties: { slot: { type: "string", enum: SLOT_NAMES } },
  required: ["slot"],
} as const;

export const brandRoutes: FastifyPluginAsync = async (fastify) => {
  /** D15 style gate: admin role only, and the org must be a parent. Org id comes from request.auth only. */
  async function brandGuard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
    if (request.auth.role !== "admin" || !(await canBeParent(fastify.prisma, request.auth.organizationId))) {
      return forbidden(reply);
    }
    return undefined;
  }

  async function loadSettings(organizationId: string) {
    const row = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: BRAND_FIELDS });
    return row ? toSettings(row) : null;
  }

  fastify.get("/organizations/brand", { preHandler: brandGuard }, async (request, reply) => {
    const data = await loadSettings(request.auth.organizationId);
    if (!data) return forbidden(reply);
    reply.header("Cache-Control", "private, no-store");
    return reply.send({ data });
  });

  fastify.put<{ Body: unknown }>(
    "/organizations/brand",
    { preHandler: brandGuard, schema: { body: { type: "object" } } },
    async (request, reply) => {
      if (request.auth.impersonation) return forbidden(reply);
      const { organizationId, userId } = request.auth;
      const parsed = validateBrandInput(request.body);
      if (!parsed.ok) return validationFailed(reply, parsed.field, parsed.message);
      const input = parsed.value;

      // D8: once approved, the public brand must always have a way to reach support.
      const current = await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { whiteLabelEnabled: true },
      });
      if (!current) return forbidden(reply);
      if (current.whiteLabelEnabled && !input.supportEmail) {
        return validationFailed(reply, "supportEmail", "A support email is required while your brand is live");
      }

      let row: BrandSettingsRow;
      try {
        row = await fastify.prisma.organization.update({
          where: { id: organizationId },
          data: {
            brandName: input.name,
            brandColor: input.color,
            brandSupportEmail: input.supportEmail,
            slug: input.slug,
            brandHidePoweredBy: input.hidePoweredBy,
          },
          select: BRAND_FIELDS,
        });
      } catch (err) {
        if ((err as { code?: string } | null)?.code === "P2002") {
          return reply.status(409).send({ error: { code: "SLUG_TAKEN", message: "That web address is already taken" } });
        }
        throw err;
      }
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "org.brand_update",
        targetType: "organization",
        targetId: organizationId,
        metadata: { fields: ["name", "color", "supportEmail", "slug", "hidePoweredBy"] },
        request,
      });
      return reply.send({ data: toSettings(row) });
    },
  );

  fastify.post<{ Params: { slot: Slot } }>(
    "/organizations/brand/assets/:slot",
    {
      config: {
        rateLimit: {
          hook: "preHandler",
          max: 20,
          timeWindow: "1 hour",
          keyGenerator: (req) => `brand-upload:${req.auth?.organizationId ?? req.ip}`,
        },
      },
      preHandler: brandGuard,
      schema: { params: slotParams },
    },
    async (request, reply) => {
      if (request.auth.impersonation) return forbidden(reply);
      const { organizationId, userId } = request.auth;
      const slot = SLOTS[request.params.slot];
      const maxBytes = slot.favicon ? MAX_FAVICON_BYTES : MAX_LOGO_BYTES;

      if (!request.isMultipart()) {
        return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
      }
      const part = await request.file({ limits: { fileSize: maxBytes + 1, files: 1 } });
      if (!part) return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });

      // Stream-check the size: stop reading as soon as the limit is passed, never buffer more than maxBytes + one chunk.
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of part.file) {
        size += (chunk as Buffer).length;
        if (size > maxBytes) {
          part.file.destroy();
          reply.header("Connection", "close");
          return reply.status(413).send({ error: { code: "FILE_TOO_LARGE", message: "That file is too large" } });
        }
        chunks.push(chunk as Buffer);
      }
      if (part.file.truncated) {
        return reply.status(413).send({ error: { code: "FILE_TOO_LARGE", message: "That file is too large" } });
      }
      const file = Buffer.concat(chunks);

      const mime = detectImageType(file, slot.favicon);
      if (!mime) {
        return reply.status(415).send({
          error: {
            code: "UNSUPPORTED_TYPE",
            message: slot.favicon ? "Use a PNG, JPEG, WebP or ICO image" : "Use a PNG, JPEG or WebP image",
          },
        });
      }

      const prefix = `brand/${organizationId}`;
      const previous = await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { [slot.column]: true },
      });
      const oldUrl = (previous as Record<string, string | null> | null)?.[slot.column] ?? null;

      const { key, url } = await uploadToR2(file, organizationId, mime, prefix);
      // Defense in depth: only a URL the public pages are allowed to render may be stored.
      if (!isAllowedAssetUrl(url)) {
        await deleteFromR2(key).catch(() => undefined);
        return reply.status(500).send({ error: { code: "UPLOAD_FAILED", message: "Upload failed" } });
      }
      const row = await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { [slot.column]: url },
        select: BRAND_FIELDS,
      });
      await removeOldAsset(organizationId, oldUrl);
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "org.brand_asset",
        targetType: "organization",
        targetId: organizationId,
        metadata: { slot: request.params.slot, op: "upload", bytes: size },
        request,
      });
      return reply.send({ data: toSettings(row) });
    },
  );

  fastify.delete<{ Params: { slot: Slot } }>(
    "/organizations/brand/assets/:slot",
    { preHandler: brandGuard, schema: { params: slotParams } },
    async (request, reply) => {
      if (request.auth.impersonation) return forbidden(reply);
      const { organizationId, userId } = request.auth;
      const slot = SLOTS[request.params.slot];
      const previous = await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { [slot.column]: true },
      });
      const oldUrl = (previous as Record<string, string | null> | null)?.[slot.column] ?? null;
      await fastify.prisma.organization.update({
        where: { id: organizationId },
        data: { [slot.column]: null },
        select: { id: true },
      });
      await removeOldAsset(organizationId, oldUrl);
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "org.brand_asset",
        targetType: "organization",
        targetId: organizationId,
        metadata: { slot: request.params.slot, op: "delete" },
        request,
      });
      return reply.status(204).send();
    },
  );

  /** Best effort: remove the replaced file, but only if it lives under this org's own brand prefix. */
  async function removeOldAsset(organizationId: string, oldUrl: string | null): Promise<void> {
    const base = `${R2_PUBLIC_URL}/brand/${organizationId}/`;
    if (!oldUrl || !R2_PUBLIC_URL || !oldUrl.startsWith(base) || oldUrl.includes("..")) return;
    await deleteFromR2(oldUrl.slice(R2_PUBLIC_URL.length + 1)).catch(() => undefined);
  }

  // Effective brand of the caller's org (own, else the parent's, else the default). Never ids.
  fastify.get("/brand", async (request, reply) => {
    const data = await resolveBrand(fastify.prisma, request.auth.organizationId);
    reply.header("Cache-Control", "private, no-store");
    return reply.send({ data });
  });

  // Public, used by the white-label sign-in pages. Every "not available" reason returns the identical 404.
  fastify.get<{ Params: { slug: string } }>(
    "/public/brand/:slug",
    {
      config: {
        public: true,
        rateLimit: {
          hook: "preHandler",
          max: 30,
          timeWindow: "1 minute",
          keyGenerator: (req) => `public-brand:${req.ip}`,
        },
      },
      attachValidation: true,
      schema: {
        params: { type: "object", properties: { slug: { type: "string", maxLength: 40 } }, required: ["slug"] },
      },
    },
    async (request, reply) => {
      if (request.validationError) return publicNotFound(reply);
      const { slug } = request.params;
      if (!validateSlug(slug)) return publicNotFound(reply);
      const org = await fastify.prisma.organization.findUnique({
        where: { slug },
        select: { id: true, isParent: true, parentOrganizationId: true, whiteLabelEnabled: true, brandName: true },
      });
      if (!org || !org.isParent || org.parentOrganizationId || !org.whiteLabelEnabled || !org.brandName) {
        return publicNotFound(reply);
      }
      const brand = await resolveBrand(fastify.prisma, org.id);
      if (brand.isDefault) return publicNotFound(reply);
      reply.header("Cache-Control", "public, max-age=60");
      return reply.send({ data: brand });
    },
  );
};
