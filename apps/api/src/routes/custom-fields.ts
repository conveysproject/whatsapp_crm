import type { FastifyPluginAsync } from "fastify";
import { checkPlanLimit } from "../lib/plan-limits.js";
import { canAccessSub } from "../lib/permissions.js";

interface CustomFieldBody {
  inputName: string;
  fieldKey?: string;
  inputType?: string;
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  options?: string[];
  isRequired?: boolean;
  isReadOnly?: boolean;
}

interface CustomFieldPatchBody extends Partial<CustomFieldBody> {
  isActive?: boolean;
}

function toFieldKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export const customFieldsRouter: FastifyPluginAsync = async (fastify) => {
  // GET /v1/contacts/custom-fields
  // ?all=1 returns inactive fields too (used by settings page)
  fastify.get<{ Querystring: { all?: string } }>(
    "/contacts/custom-fields",
    async (request, reply) => {
      const { organizationId } = request.auth;
      const includeAll = request.query.all === "1";
      const fields = await fastify.prisma.contactCustomField.findMany({
        where: { organizationId, ...(includeAll ? {} : { isActive: true }) },
        orderBy: { createdAt: "asc" },
      });
      return reply.send({ data: fields });
    }
  );

  // POST /v1/contacts/custom-fields
  fastify.post<{ Body: CustomFieldBody }>(
    "/contacts/custom-fields",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
      }
      const {
        inputName,
        fieldKey,
        inputType = "text",
        description,
        placeholder,
        defaultValue,
        options = [],
        isRequired = false,
        isReadOnly = false,
      } = request.body;

      if (!inputName?.trim()) {
        return reply
          .status(400)
          .send({ error: { code: "MISSING_FIELDS", message: "inputName is required" } });
      }

      const limitCheck = await checkPlanLimit(fastify.prisma, organizationId, "custom_fields");
      if (!limitCheck.allowed) {
        return reply.status(402).send({
          error: {
            code: "PLAN_LIMIT_REACHED",
            message: `Custom field limit of ${limitCheck.limit} reached`,
          },
        });
      }

      const resolvedKey = fieldKey?.trim() ? fieldKey.trim() : toFieldKey(inputName);

      const field = await fastify.prisma.contactCustomField.create({
        data: {
          organizationId,
          inputName: inputName.trim(),
          fieldKey: resolvedKey,
          inputType,
          description: description ?? null,
          placeholder: placeholder ?? null,
          defaultValue: defaultValue ?? null,
          options,
          isRequired,
          isReadOnly,
        },
      });

      return reply.status(201).send({ data: field });
    }
  );

  // PATCH /v1/contacts/custom-fields/:id
  fastify.patch<{ Params: { id: string }; Body: CustomFieldPatchBody }>(
    "/contacts/custom-fields/:id",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
      }
      const existing = await fastify.prisma.contactCustomField.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!existing) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "Custom field not found" } });
      }

      const {
        inputName,
        fieldKey,
        inputType,
        description,
        placeholder,
        defaultValue,
        options,
        isRequired,
        isReadOnly,
        isActive,
      } = request.body;

      const updated = await fastify.prisma.contactCustomField.update({
        where: { id: existing.id },
        data: {
          ...(inputName !== undefined ? { inputName: inputName.trim() } : {}),
          ...(fieldKey !== undefined ? { fieldKey: fieldKey.trim() } : {}),
          ...(inputType !== undefined ? { inputType } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(placeholder !== undefined ? { placeholder } : {}),
          ...(defaultValue !== undefined ? { defaultValue } : {}),
          ...(options !== undefined ? { options } : {}),
          ...(isRequired !== undefined ? { isRequired } : {}),
          ...(isReadOnly !== undefined ? { isReadOnly } : {}),
          ...(isActive !== undefined ? { isActive } : {}),
        },
      });

      return reply.send({ data: updated });
    }
  );

  // DELETE /v1/contacts/custom-fields/:id  (soft-delete via isActive=false)
  fastify.delete<{ Params: { id: string } }>(
    "/contacts/custom-fields/:id",
    async (request, reply) => {
      const { organizationId, role, permissions } = request.auth;
      if (!canAccessSub(role, permissions, "contacts_access", "contacts_manage_custom_fields")) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Permission required: manage_contacts" } });
      }
      const field = await fastify.prisma.contactCustomField.findFirst({
        where: { id: request.params.id, organizationId },
      });
      if (!field) {
        return reply
          .status(404)
          .send({ error: { code: "NOT_FOUND", message: "Custom field not found" } });
      }
      await fastify.prisma.contactCustomField.update({
        where: { id: field.id },
        data: { isActive: false },
      });
      return reply.status(204).send();
    }
  );
};
