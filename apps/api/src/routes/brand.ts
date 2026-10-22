import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { writeAdminAudit } from "../lib/audit.js";
import { isAllowedAssetUrl, resolveBrand, validateBrandInput, validateSlug } from "../lib/brand.js";
import { canBeParent } from "../lib/parent-orgs.js";
import { clientIp } from "../lib/public-api/client-ip.js";
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
  brandRevision: true,
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
  brandRevision: number;
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
    brandRevision: o.brandRevision,
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
  // PNG: signature, then the first chunk must be IHDR.
  if (
    buf.length >= 16 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
    buf.toString("latin1", 12, 16) === "IHDR"
  ) {
    return "image/png";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  // ICO (type 1, not CUR) with at least one image.
  if (allowIco && buf.length >= 6 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0 && buf.readUInt16LE(4) > 0) {
    return "image/x-icon";
  }
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

  type Current = Record<string, unknown> & { whiteLabelEnabled: boolean };
  type Decision = { data: Record<string, unknown>; resets: boolean } | { stop: (reply: FastifyReply) => FastifyReply };
  type Outcome =
    | { kind: "ok"; row: BrandSettingsRow; cur: Current; resets: boolean }
    | { kind: "stop"; send: (reply: FastifyReply) => FastifyReply }
    | { kind: "conflict" };

  /**
   * The one place brand rows are written. Every write bumps brandRevision (approval is bound to a revision).
   * - Live brand and the change needs re-approval: ONE update that also switches the brand off.
   * - Otherwise a conditional updateMany that only applies while the flag still has the value that was read, so a
   *   concurrent approval can never slip an unreviewed change in. On a miss the decision is redone once.
   */
  async function commitBrand(
    organizationId: string,
    extraSelect: Record<string, true>,
    decide: (cur: Current) => Decision,
  ): Promise<Outcome> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const cur = (await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { ...extraSelect, whiteLabelEnabled: true },
      })) as Current | null;
      if (!cur) return { kind: "stop", send: forbidden };
      const d = decide(cur);
      if ("stop" in d) return { kind: "stop", send: d.stop };
      const data = { ...d.data, brandRevision: { increment: 1 } };
      if (d.resets) {
        const row = await fastify.prisma.organization.update({
          where: { id: organizationId },
          data: { ...data, whiteLabelEnabled: false },
          select: BRAND_FIELDS,
        });
        return { kind: "ok", row, cur, resets: true };
      }
      const res = await fastify.prisma.organization.updateMany({
        where: { id: organizationId, whiteLabelEnabled: cur.whiteLabelEnabled },
        data,
      });
      if (res.count === 0) continue;
      const row = await fastify.prisma.organization.findUnique({ where: { id: organizationId }, select: BRAND_FIELDS });
      if (!row) return { kind: "stop", send: forbidden };
      return { kind: "ok", row, cur, resets: false };
    }
    return { kind: "conflict" };
  }

  const conflict = (reply: FastifyReply) =>
    reply.status(409).send({ error: { code: "CONFLICT", message: "The brand changed while saving; please try again" } });

  fastify.put<{ Body: unknown }>("/organizations/brand", { preHandler: brandGuard }, async (request, reply) => {
    if (request.auth.impersonation) return forbidden(reply);
    const { organizationId, userId } = request.auth;
    const parsed = validateBrandInput(request.body);
    if (!parsed.ok) return validationFailed(reply, parsed.field, parsed.message);
    const input = parsed.value;

    let outcome: Outcome;
    try {
      outcome = await commitBrand(
        organizationId,
        { brandName: true, slug: true, brandSupportEmail: true },
        (cur) => {
          // D8: once approved, the public brand must always have a way to reach support.
          if (cur.whiteLabelEnabled && !input.supportEmail) {
            return { stop: (r) => validationFailed(r, "supportEmail", "A support email is required while your brand is live") };
          }
          // A new name or web address on a live brand needs a fresh approval.
          const resets = cur.whiteLabelEnabled && (cur.brandName !== input.name || cur.slug !== input.slug);
          return {
            resets,
            data: {
              brandName: input.name,
              brandColor: input.color,
              brandSupportEmail: input.supportEmail,
              slug: input.slug,
              brandHidePoweredBy: input.hidePoweredBy,
            },
          };
        },
      );
    } catch (err) {
      if ((err as { code?: string } | null)?.code === "P2002") {
        return reply.status(409).send({ error: { code: "SLUG_TAKEN", message: "That web address is already taken" } });
      }
      throw err;
    }
    if (outcome.kind === "stop") return outcome.send(reply);
    if (outcome.kind === "conflict") return conflict(reply);
    const { row, cur, resets } = outcome;
    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: userId,
      action: "org.brand_update",
      targetType: "organization",
      targetId: organizationId,
      metadata: {
        before: { name: cur["brandName"], slug: cur["slug"], supportEmail: cur["brandSupportEmail"] },
        after: { name: input.name, slug: input.slug, supportEmail: input.supportEmail },
        approvalReset: resets,
        revision: row.brandRevision,
      },
      request,
    });
    return reply.send({ data: toSettings(row), reapprovalRequired: resets });
  });

  fastify.post<{ Params: { slot: Slot } }>(
    "/organizations/brand/assets/:slot",
    {
      config: {
        rateLimit: {
          hook: "preHandler",
          max: 20,
          timeWindow: "1 hour",
          keyGenerator: (req) =>
            `brand-upload:${req.auth?.organizationId ?? clientIp(req.ip, req.headers["x-forwarded-for"], req.headers["x-real-ip"])}`,
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

      const publicBase = process.env["R2_PUBLIC_URL"] ?? "";
      if (!publicBase.startsWith("https://")) {
        request.log.error("R2_PUBLIC_URL is not set to an https URL: brand uploads are disabled");
        return reply.status(503).send({ error: { code: "UPLOADS_UNAVAILABLE", message: "Uploads are not available right now" } });
      }
      if (!request.isMultipart()) {
        return reply.status(400).send({ error: { code: "NO_FILE", message: "No file uploaded" } });
      }
      const part = await request.file({ throwFileSizeLimit: false, limits: { fileSize: maxBytes + 1, files: 1 } });
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

      const { key, url } = await uploadToR2(file, organizationId, mime, `brand/${organizationId}`);
      // Defense in depth: only a URL the public pages are allowed to render may be stored.
      if (!isAllowedAssetUrl(url)) {
        await deleteFromR2(key).catch(() => undefined);
        return reply.status(500).send({ error: { code: "UPLOAD_FAILED", message: "Upload failed" } });
      }
      let outcome: Outcome;
      try {
        // Any image change on a live brand needs a fresh approval.
        outcome = await commitBrand(organizationId, { [slot.column]: true }, (cur) => ({
          resets: cur.whiteLabelEnabled,
          data: { [slot.column]: url },
        }));
      } catch (err) {
        await deleteFromR2(key).catch(() => undefined);
        throw err;
      }
      if (outcome.kind !== "ok") {
        await deleteFromR2(key).catch(() => undefined);
        return outcome.kind === "stop" ? outcome.send(reply) : conflict(reply);
      }
      const { row, cur, resets } = outcome;
      await removeOldAsset(organizationId, (cur[slot.column] as string | null | undefined) ?? null);
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "org.brand_asset",
        targetType: "organization",
        targetId: organizationId,
        metadata: { slot: request.params.slot, op: "upload", url, bytes: size, approvalReset: resets, revision: row.brandRevision },
        request,
      });
      return reply.send({ data: toSettings(row), reapprovalRequired: resets });
    },
  );

  fastify.delete<{ Params: { slot: Slot } }>(
    "/organizations/brand/assets/:slot",
    { preHandler: brandGuard, schema: { params: slotParams } },
    async (request, reply) => {
      if (request.auth.impersonation) return forbidden(reply);
      const { organizationId, userId } = request.auth;
      const slot = SLOTS[request.params.slot];
      // Re-approval only when the slot actually held an image.
      const outcome = await commitBrand(organizationId, { [slot.column]: true }, (cur) => ({
        resets: cur.whiteLabelEnabled && ((cur[slot.column] as string | null | undefined) ?? null) !== null,
        data: { [slot.column]: null },
      }));
      if (outcome.kind === "stop") return outcome.send(reply);
      if (outcome.kind === "conflict") return conflict(reply);
      const { row, cur, resets } = outcome;
      await removeOldAsset(organizationId, (cur[slot.column] as string | null | undefined) ?? null);
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "org.brand_asset",
        targetType: "organization",
        targetId: organizationId,
        metadata: { slot: request.params.slot, op: "delete", url: null, approvalReset: resets, revision: row.brandRevision },
        request,
      });
      return reply.send({ data: toSettings(row), reapprovalRequired: resets });
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
          keyGenerator: (req) => `public-brand:${clientIp(req.ip, req.headers["x-forwarded-for"], req.headers["x-real-ip"])}`,
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
