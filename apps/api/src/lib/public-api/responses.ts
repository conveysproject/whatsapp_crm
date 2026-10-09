import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import { apiErrorBody, type ApiErrorCode } from "./error-catalog.js";

export function newApiId(): string {
  return randomUUID();
}

export function plivoErrorBody(message: string, apiId?: string) {
  return apiErrorBody("REQUEST_FAILED", { message, ...(apiId ? { apiId } : {}) });
}

export function plivoError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send(plivoErrorBody(message, reply.request?.apiId));
}

export function apiError(reply: FastifyReply, status: number, code: ApiErrorCode, opts: { message?: string; hint?: string } = {}) {
  return reply.status(status).send(apiErrorBody(code, { ...opts, ...(reply.request?.apiId ? { apiId: reply.request.apiId } : {}) }));
}
