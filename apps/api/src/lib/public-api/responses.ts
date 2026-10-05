import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";

export function newApiId(): string {
  return randomUUID();
}

/**
 * The ONLY producer of the public error body (plivoError, the plugin's error handler and the throttle response all
 * use it). PROVISIONAL: confirm against a real Plivo error response from the client, then change it here only.
 */
export function plivoErrorBody(message: string): { api_id: string; error: string } {
  return { api_id: newApiId(), error: message };
}

export function plivoError(reply: FastifyReply, status: number, message: string) {
  return reply.status(status).send(plivoErrorBody(message));
}
