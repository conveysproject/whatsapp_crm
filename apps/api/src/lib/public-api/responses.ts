import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";

export function newApiId(): string {
  return randomUUID();
}

/** Single place for the public error body shape. PROVISIONAL: confirm against a real Plivo error response from the client. */
export function plivoError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send({ api_id: newApiId(), error: message });
}
