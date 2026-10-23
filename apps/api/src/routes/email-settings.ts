import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { writeAdminAudit } from "../lib/audit.js";
import { PLAIN_EMAIL_RE, resolveBrand } from "../lib/brand.js";
import { escapeHtml, subjectText } from "../lib/email-brand.js";
import { buildTransport, validateProviderConfig, type ProviderConfig } from "../lib/email/transport.js";
import { canBeParent } from "../lib/parent-orgs.js";
import { redis } from "../lib/redis.js";
import { incrWithTtl } from "../lib/redis-counter.js";
import { decryptJson, encryptJson, SecretBoxKeyError } from "../lib/secret-box.js";

const TEST_LIMIT = 5;
const TEST_WINDOW_SECONDS = 3600;
const MAX_REASON = 120;
const BODY_FIELDS = ["provider", "config", "fromAddress", "fromName", "replyTo"];
// Angle brackets, control characters and format characters (zero-width, bidi overrides).
const BAD_NAME_RE = /[<>\p{Cc}\p{Cf}]/u;

// One body for every reason the settings are not available to the caller.
const forbidden = (reply: FastifyReply) => reply.status(403).send({ error: { code: "FORBIDDEN", message: "Not available" } });
const validationFailed = (reply: FastifyReply, field: string, message: string) =>
  reply.status(400).send({ error: { code: "VALIDATION_FAILED", field, message } });
// No variable name in the body; the name is logged once server-side.
const unavailable = (reply: FastifyReply) =>
  reply.status(503).send({ error: { code: "EMAIL_PROVIDER_UNAVAILABLE", message: "Email provider settings are not available right now" } });

interface StoredRow {
  id: string;
  provider: string;
  fromAddress: string;
  fromName: string | null;
  replyTo: string | null;
  configEnc: string;
  status: string;
  consecutiveFailures: number;
  lastError: string | null;
  lastTestedAt: Date | null;
  updatedAt: Date;
}

/** Whitelist of the non-secret parts of a stored config. Anything else (apiKey, pass, unknown keys) is dropped. */
function publicConfig(provider: string, cfg: unknown): Record<string, unknown> {
  const c = (typeof cfg === "object" && cfg !== null ? cfg : {}) as Record<string, unknown>;
  const pick = (keys: string[]) => Object.fromEntries(keys.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]));
  if (provider === "smtp") return pick(["host", "port", "security", "allowPlain", "user"]);
  if (provider === "mailgun") return pick(["domain", "region"]);
  return pick(["region"]);
}

function toData(row: StoredRow, cfg: unknown) {
  return {
    provider: row.provider,
    fromAddress: row.fromAddress,
    fromName: row.fromName,
    replyTo: row.replyTo,
    status: row.status,
    lastError: row.lastError,
    lastTestedAt: row.lastTestedAt,
    consecutiveFailures: row.consecutiveFailures,
    hasCredentials: true,
    ...(cfg === null ? { configReadable: false } : { config: publicConfig(row.provider, cfg) }),
  };
}

function secretField(provider: string): "pass" | "apiKey" {
  return provider === "smtp" ? "pass" : "apiKey";
}

export const emailSettingsRoutes: FastifyPluginAsync = async (fastify) => {
  /** Admin role only, a parent-capable org, never an impersonation session. Org id comes from request.auth only. */
  async function guard(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
    if (
      request.auth.impersonation ||
      request.auth.role !== "admin" ||
      !(await canBeParent(fastify.prisma, request.auth.organizationId))
    ) {
      return forbidden(reply);
    }
    return undefined;
  }

  let keyLogged = false;
  function keyMissing(request: FastifyRequest): void {
    if (!keyLogged) {
      keyLogged = true;
      request.log.error("EMAIL_SETTINGS_KEY is missing or invalid: client email settings are disabled");
    }
  }

  /** Decrypts a stored config; null when it cannot be read. Throws SecretBoxKeyError when there is no usable key. */
  function readConfig(blob: string): Record<string, unknown> | null {
    try {
      return decryptJson<Record<string, unknown>>(blob);
    } catch (err) {
      if (err instanceof SecretBoxKeyError) throw err;
      return null;
    }
  }

  fastify.get("/organizations/email-settings", { preHandler: guard }, async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    const row = (await fastify.prisma.orgEmailSettings.findUnique({
      where: { organizationId: request.auth.organizationId },
    })) as StoredRow | null;
    if (!row) return reply.send({ data: null });
    let cfg: Record<string, unknown> | null;
    try {
      cfg = readConfig(row.configEnc);
    } catch {
      cfg = null; // key missing: still report the row, never an error
    }
    return reply.send({ data: toData(row, cfg) });
  });

  fastify.put<{ Body: unknown }>("/organizations/email-settings", { preHandler: guard }, async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const body = request.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return validationFailed(reply, "body", "Email settings are required");
    }
    const b = body as Record<string, unknown>;
    if (Object.keys(b).some((k) => !BODY_FIELDS.includes(k))) return validationFailed(reply, "body", "Unknown field");

    const provider = b["provider"];
    if (typeof provider !== "string") return validationFailed(reply, "provider", "Unknown email provider");

    const fromAddress = typeof b["fromAddress"] === "string" ? b["fromAddress"].trim() : "";
    if (!PLAIN_EMAIL_RE.test(fromAddress)) return validationFailed(reply, "fromAddress", "From address must be a single email address");

    let fromName: string | null = null;
    const fn = b["fromName"];
    if (fn !== undefined && fn !== null && fn !== "") {
      const name = typeof fn === "string" ? fn.normalize("NFKC").trim() : "";
      const len = [...name].length;
      if (len < 2 || len > 60 || BAD_NAME_RE.test(name)) {
        return validationFailed(reply, "fromName", "From name must be 2 to 60 characters, without < > or hidden characters");
      }
      fromName = name;
    }

    let replyTo: string | null = null;
    const rt = b["replyTo"];
    if (rt !== undefined && rt !== null && rt !== "") {
      const v = typeof rt === "string" ? rt.trim() : "";
      if (!PLAIN_EMAIL_RE.test(v)) return validationFailed(reply, "replyTo", "Reply-to must be a single email address");
      replyTo = v;
    }

    const rawConfig = b["config"];
    if (typeof rawConfig !== "object" || rawConfig === null || Array.isArray(rawConfig)) {
      return validationFailed(reply, "config", "Configuration must be an object");
    }
    const config: Record<string, unknown> = { ...(rawConfig as Record<string, unknown>) };
    if (provider === "smtp") config["fromAddress"] = fromAddress;

    if (!process.env["EMAIL_SETTINGS_KEY"]) {
      keyMissing(request);
      return unavailable(reply);
    }

    const existing = (await fastify.prisma.orgEmailSettings.findUnique({ where: { organizationId } })) as StoredRow | null;
    const field = secretField(provider);
    let credentialsReplaced = true;
    if (config[field] === undefined && existing && existing.provider === provider) {
      // Same provider: keep the stored secret so the UI never needs it back.
      let old: Record<string, unknown> | null = null;
      try {
        old = readConfig(existing.configEnc);
      } catch {
        keyMissing(request);
        return unavailable(reply);
      }
      if (old && typeof old[field] === "string") {
        // SMTP: the password is sent to host:port, so it may only be kept while the whole connection target is
        // unchanged (compared after the validator's normalisation). Otherwise a changed host would receive it.
        // API providers send the key to a fixed provider host (Mailgun domain is only a path segment): mergeable.
        if (provider === "smtp") {
          const probe = validateProviderConfig("smtp", { ...config, pass: "x" });
          if (!probe.ok) return validationFailed(reply, probe.field, probe.message);
          const n = probe.config as unknown as Record<string, unknown>;
          const same = ["host", "port", "security", "user"].every((k) => n[k] === old[k]) && (n["allowPlain"] ?? false) === (old["allowPlain"] ?? false);
          if (!same) {
            return validationFailed(reply, "pass", "Re-enter the password when the server, port, security or username changes");
          }
        }
        config[field] = old[field];
        credentialsReplaced = false;
      }
    }

    const v = validateProviderConfig(provider, config);
    if (!v.ok) return validationFailed(reply, v.field, v.message);

    let configEnc: string;
    try {
      configEnc = encryptJson(v.config);
    } catch (err) {
      if (err instanceof SecretBoxKeyError) {
        keyMissing(request);
        return unavailable(reply);
      }
      throw err;
    }

    const data = { provider, fromAddress, fromName, replyTo, configEnc, status: "unverified", consecutiveFailures: 0, lastError: null };
    const row = (await fastify.prisma.orgEmailSettings.upsert({
      where: { organizationId },
      create: { organizationId, ...data },
      update: data,
    })) as StoredRow;

    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: userId,
      action: "email_settings.update",
      targetType: "organization",
      targetId: organizationId,
      metadata: { provider, fromAddress, credentialsReplaced, created: !existing },
      request,
    });
    reply.header("Cache-Control", "private, no-store");
    return reply.send({ data: toData(row, v.config) });
  });

  fastify.post<{ Body: unknown }>("/organizations/email-settings/test", { preHandler: guard }, async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const body = request.body;
    const emptyBody = body === undefined || body === null || (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0);
    if (!emptyBody) return validationFailed(reply, "body", "This request takes no fields");

    // Atomic fixed-window limiter; errors propagate so it fails closed.
    const count = await incrWithTtl(redis, `email-settings-test:${organizationId}`, TEST_WINDOW_SECONDS);
    if (count > TEST_LIMIT) {
      const ttl = await redis.ttl(`email-settings-test:${organizationId}`).catch(() => -1);
      reply.header("Retry-After", String(ttl > 0 ? ttl : TEST_WINDOW_SECONDS));
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many test emails; try again later" } });
    }

    const row = (await fastify.prisma.orgEmailSettings.findUnique({ where: { organizationId } })) as StoredRow | null;
    if (!row) return reply.status(404).send({ error: { code: "NOT_CONFIGURED", message: "Email settings are not configured" } });

    let cfg: Record<string, unknown> | null;
    try {
      cfg = readConfig(row.configEnc);
    } catch {
      keyMissing(request);
      return unavailable(reply);
    }
    const audit = (result: Record<string, unknown>) =>
      writeAdminAudit({
        prisma: fastify.prisma,
        actorId: userId,
        action: "email_settings.test",
        targetType: "organization",
        targetId: organizationId,
        metadata: { provider: row.provider, ...result },
        request,
      });
    if (!cfg) {
      audit({ ok: false, reason: "stored credentials cannot be read" });
      return reply.send({
        data: { status: "unverified", ok: false, reason: "stored credentials cannot be read; save the settings again", retryable: false },
      });
    }

    // The recipient is always the caller's own address, looked up by the authenticated user id.
    const user = await fastify.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const to = user?.email;
    if (!to || !PLAIN_EMAIL_RE.test(to)) {
      return reply.status(409).send({ error: { code: "NO_RECIPIENT", message: "Your account has no email address to send the test to" } });
    }

    const brand = await resolveBrand(fastify.prisma, organizationId);
    const sentence = `This is a test email from ${escapeHtml(subjectText(brand.name))}. If you can read this, your email provider is connected.`;
    const html = `<p style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a">${sentence}</p>`;

    let ok = false;
    let reason = "";
    let retryable = false;
    try {
      const transport = buildTransport({ provider: row.provider, ...cfg } as unknown as ProviderConfig);
      const res = await transport.send({
        from: { name: row.fromName, address: row.fromAddress },
        to,
        subject: `Test email from ${subjectText(brand.name)}`,
        html,
        ...(row.replyTo ? { replyTo: row.replyTo } : {}),
      });
      if (res.ok) ok = true;
      else {
        reason = String(res.reason).slice(0, MAX_REASON);
        retryable = res.retryable;
      }
    } catch {
      // Never use the error text: it could carry provider or credential details.
      reason = "could not send the test email";
      retryable = true;
    }

    // Only the exact row that was tested may be updated; a concurrent PUT changes updatedAt and wins.
    const result = await fastify.prisma.orgEmailSettings.updateMany({
      where: { id: row.id, organizationId, updatedAt: row.updatedAt },
      data: ok
        ? { status: "verified", lastTestedAt: new Date(), consecutiveFailures: 0, lastError: null }
        : { status: "unverified", lastTestedAt: new Date(), lastError: reason },
    });
    if (result.count === 0) {
      audit({ ok: false, reason: "settings changed during the test" });
      return reply.send({ data: { status: "unverified", ok: false, reason: "settings changed during the test", retryable: true } });
    }
    audit(ok ? { ok: true } : { ok: false, reason });
    if (ok) return reply.send({ data: { status: "verified" } });
    return reply.send({ data: { status: "unverified", ok: false, reason, retryable } });
  });

  fastify.delete("/organizations/email-settings", { preHandler: guard }, async (request, reply) => {
    const { organizationId, userId } = request.auth;
    const res = await fastify.prisma.orgEmailSettings.deleteMany({ where: { organizationId } });
    writeAdminAudit({
      prisma: fastify.prisma,
      actorId: userId,
      action: "email_settings.delete",
      targetType: "organization",
      targetId: organizationId,
      metadata: { existed: res.count > 0 },
      request,
    });
    return reply.status(204).send();
  });
};
