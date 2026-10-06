import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import type { Prisma } from "@prisma/client";
import { newApiId, plivoError } from "../../lib/public-api/responses.js";
import {
  parseTemplateBody, parseListQuery, toSubmitResponse, toListObject, toRetrieveResponse, TemplateValidationError,
  type ParsedTemplate, type TemplateRow,
} from "../../lib/public-api/templates-mapping.js";
import { safeErr } from "../../lib/public-api/safe-err.js";
import { submitTemplateToMeta, editTemplateOnMeta, deleteTemplateOnMeta, MetaTemplateError } from "../../lib/meta-templates.js";
import { extractTemplateFields } from "../../lib/template-components.js";

const PUBLIC = { config: { public: true } } as const;
const both = (p: string) => [p, p.replace(/\/$/, "")];
// Identical for an unknown template and for a waba/template that belongs to another organization.
const NOT_FOUND = "Resource not found";

type Components = Parameters<typeof submitTemplateToMeta>[0]["components"];

interface Ctx { organizationId: string; wabaId: string }

/** Meta rejected the request (our input) vs. Meta was unreachable / failed (not the caller's fault). */
// Meta auth (401/403) and throttling (429) are our problem, not the caller's template, so they are reported as 502 too.
const isMetaOutage = (err: MetaTemplateError) => err.status === 0 || err.status >= 500 || err.status === 401 || err.status === 403 || err.status === 429;
const metaMessage = (err: MetaTemplateError) => (err.code === null ? "Meta rejected the template" : `Meta rejected the template (code ${err.code})`);

export const publicApiTemplatesRouter: FastifyPluginAsync = async (fastify) => {
  /** Resolves the credential's organization and checks the URL's waba_id belongs to it. Sends the 404 itself. */
  async function resolveOrg(request: FastifyRequest, reply: FastifyReply, wabaId: string): Promise<(Ctx & { accessToken: () => Promise<string | null> }) | null> {
    const { organizationId } = request.publicApi!;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { whatsappBusinessAccountId: true, wabaAccessToken: true },
    });
    if (!org?.whatsappBusinessAccountId || org.whatsappBusinessAccountId !== wabaId) {
      plivoError(reply, 404, NOT_FOUND);
      return null;
    }
    return {
      organizationId,
      wabaId,
      accessToken: async () => {
        if (org.wabaAccessToken) return org.wabaAccessToken;
        const vs = await fastify.prisma.vendorSetting.findFirst({ where: { organizationId, key: "whatsapp_access_token" }, select: { value: true } });
        return vs?.value || null;
      },
    };
  }

  const notConnected = (reply: FastifyReply) => plivoError(reply, 400, "WhatsApp is not connected");

  /** Maps a Meta failure to a response. Logs name/code only: never Meta's text, the token or the request. */
  function metaFailure(request: FastifyRequest, reply: FastifyReply, err: unknown, op: string) {
    request.log.error({ error: safeErr(err), op, organizationId: request.publicApi!.organizationId }, "public API template Meta call failed");
    // A refused delete is always a 502 (the template still exists at Meta); create/update refusals are the caller's input (400).
    if (op !== "delete" && err instanceof MetaTemplateError && !isMetaOutage(err)) return plivoError(reply, 400, metaMessage(err));
    const code = err instanceof MetaTemplateError ? err.code : null;
    return plivoError(reply, 502, code === null ? "Meta request failed" : `Meta request failed (code ${code})`);
  }

  function parseOr400(request: FastifyRequest, reply: FastifyReply): ParsedTemplate | null {
    try { return parseTemplateBody(request.body); }
    catch (err) {
      if (err instanceof TemplateValidationError) { plivoError(reply, 400, err.message); return null; }
      throw err;
    }
  }

  // Create
  for (const path of both("/WhatsApp/Template/:wabaId/")) {
    fastify.post<{ Params: { authId: string; wabaId: string }; Body: unknown }>(path, PUBLIC, async (request, reply) => {
      const parsed = parseOr400(request, reply);
      if (!parsed) return reply;
      const ctx = await resolveOrg(request, reply, request.params.wabaId);
      if (!ctx) return reply;
      const accessToken = await ctx.accessToken();
      if (!accessToken) return notConnected(reply);
      const { organizationId } = ctx;

      // The table has no unique constraint: serialize creates of the same (org, name, language) with a transaction-scoped
      // advisory lock so the duplicate check and the insert are atomic.
      const created = await fastify.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${organizationId}|${parsed.name}|${parsed.language}`}))`;
        const dup = await tx.template.findFirst({ where: { organizationId, name: parsed.name, language: parsed.language }, select: { id: true } });
        if (dup) return null;
        return tx.template.create({
          data: {
            organizationId, name: parsed.name, language: parsed.language, category: parsed.category, status: "draft",
            components: parsed.components as Prisma.InputJsonValue, ...extractTemplateFields(parsed.components),
          },
          select: { id: true },
        });
      });
      if (!created) return plivoError(reply, 400, "A template with this name and language already exists");

      const dropDraft = async () => {
        try { await fastify.prisma.template.deleteMany({ where: { id: created.id, organizationId } }); }
        catch (e) { request.log.error({ error: safeErr(e) }, "public API template cleanup failed"); }
      };

      let metaTemplateId: string;
      try {
        ({ metaTemplateId } = await submitTemplateToMeta({
          wabaId: ctx.wabaId, accessToken, name: parsed.name, category: parsed.category, language: parsed.language,
          components: parsed.components as unknown as Components, allowCategoryChange: parsed.allowCategoryChange,
        }));
      } catch (err) {
        await dropDraft();
        return metaFailure(request, reply, err, "create");
      }

      // Meta now has the template. If this update fails the draft row stays (no id yet); the dashboard sync reconciles it by name+language.
      const row = await fastify.prisma.template.update({
        where: { id: created.id, organizationId },
        data: { metaTemplateId, status: "pending" },
        select: { metaTemplateId: true, name: true, language: true, category: true, status: true },
      });
      return reply.send(toSubmitResponse(row));
    });
  }

  // List
  for (const path of both("/WhatsApp/Template/:wabaId/")) {
    fastify.get<{ Params: { authId: string; wabaId: string }; Querystring: Record<string, unknown> }>(path, PUBLIC, async (request, reply) => {
      const ctx = await resolveOrg(request, reply, request.params.wabaId);
      if (!ctx) return reply;
      const { name, limit, offset } = parseListQuery(request.query);
      const where = {
        organizationId: ctx.organizationId,
        metaTemplateId: { not: null },
        ...(name ? { name: { contains: name, mode: "insensitive" as const } } : {}),
      };
      // take limit+1 to know whether a next page exists without a count query
      const found = await fastify.prisma.template.findMany({
        where, orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], skip: offset, take: limit + 1,
        select: { metaTemplateId: true, name: true, language: true, category: true, status: true },
      });
      const base = `/v1/Account/${request.params.authId}/WhatsApp/Template/${encodeURIComponent(ctx.wabaId)}/`;
      const link = (o: number) => {
        const sp = new URLSearchParams();
        if (name) sp.set("template_name", name);
        sp.set("limit", String(limit));
        sp.set("offset", String(o));
        return `${base}?${sp.toString()}`;
      };
      return reply.send({
        api_id: newApiId(),
        status: "success",
        meta: { limit, offset, next: found.length > limit ? link(offset + limit) : null, previous: offset > 0 ? link(Math.max(offset - limit, 0)) : null },
        objects: found.slice(0, limit).map(toListObject),
      });
    });
  }

  // Retrieve
  for (const path of both("/WhatsApp/Template/:wabaId/:templateId/")) {
    fastify.get<{ Params: { authId: string; wabaId: string; templateId: string } }>(path, PUBLIC, async (request, reply) => {
      const ctx = await resolveOrg(request, reply, request.params.wabaId);
      if (!ctx) return reply;
      const row = await fastify.prisma.template.findFirst({ where: { organizationId: ctx.organizationId, metaTemplateId: request.params.templateId } });
      if (!row) return plivoError(reply, 404, NOT_FOUND);
      return reply.send(toRetrieveResponse(row as unknown as TemplateRow));
    });
  }

  // Update (edit components at Meta; the template returns to review)
  for (const path of both("/WhatsApp/Template/:wabaId/:templateId/")) {
    fastify.post<{ Params: { authId: string; wabaId: string; templateId: string }; Body: unknown }>(path, PUBLIC, async (request, reply) => {
      const parsed = parseOr400(request, reply);
      if (!parsed) return reply;
      const ctx = await resolveOrg(request, reply, request.params.wabaId);
      if (!ctx) return reply;
      const { organizationId } = ctx;
      const row = await fastify.prisma.template.findFirst({ where: { organizationId, metaTemplateId: request.params.templateId } });
      if (!row?.metaTemplateId) return plivoError(reply, 404, NOT_FOUND);
      if (row.status !== "approved" && row.status !== "rejected") return plivoError(reply, 400, "Only approved or rejected templates can be edited");
      if (parsed.name !== row.name || parsed.language !== row.language || parsed.category !== row.category) {
        return plivoError(reply, 400, "name, language and category cannot be changed");
      }
      const accessToken = await ctx.accessToken();
      if (!accessToken) return notConnected(reply);

      try { await editTemplateOnMeta({ accessToken, metaTemplateId: row.metaTemplateId, components: parsed.components }); }
      catch (err) { return metaFailure(request, reply, err, "update"); }

      const updated = await fastify.prisma.template.update({
        where: { id: row.id, organizationId },
        data: {
          components: parsed.components as Prisma.InputJsonValue, ...extractTemplateFields(parsed.components),
          lastEditedTime: new Date(), status: "pending",
        },
        select: { metaTemplateId: true, name: true, language: true, category: true, status: true },
      });
      return reply.send(toSubmitResponse(updated));
    });
  }

  // Delete (Meta first; the local row is removed only once Meta no longer has the template)
  for (const path of both("/WhatsApp/Template/:wabaId/:templateId/")) {
    fastify.delete<{ Params: { authId: string; wabaId: string; templateId: string }; Querystring: Record<string, unknown> }>(path, PUBLIC, async (request, reply) => {
      const ctx = await resolveOrg(request, reply, request.params.wabaId);
      if (!ctx) return reply;
      const { organizationId } = ctx;
      const row = await fastify.prisma.template.findFirst({ where: { organizationId, metaTemplateId: request.params.templateId } });
      if (!row?.metaTemplateId) return plivoError(reply, 404, NOT_FOUND);
      const nameParam = request.query["name"];
      const name = typeof nameParam === "string" ? nameParam : Array.isArray(nameParam) && typeof nameParam[0] === "string" ? nameParam[0] : undefined;
      if (name !== row.name) return plivoError(reply, 400, "name query parameter must match the template name");
      const accessToken = await ctx.accessToken();
      if (!accessToken) return notConnected(reply);

      try { await deleteTemplateOnMeta({ wabaId: ctx.wabaId, accessToken, name: row.name, metaTemplateId: row.metaTemplateId }); }
      catch (err) { return metaFailure(request, reply, err, "delete"); }

      await fastify.prisma.template.deleteMany({ where: { id: row.id, organizationId } });
      return reply.status(204).send();
    });
  }
};
