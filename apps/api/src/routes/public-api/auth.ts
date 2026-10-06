import type { FastifyReply, FastifyRequest } from "fastify";
import { tokenMatchesHash } from "../../lib/public-api/credentials.js";
import { plivoError } from "../../lib/public-api/responses.js";
import { checkPublicApiAccess } from "../../lib/public-api/access.js";

const DUMMY_HASH = "0".repeat(64); // keeps the compare cost constant when the credential does not exist
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;
const BAD_CREDENTIALS = "Authentication credentials were not provided or are invalid";

export async function publicApiAuth(
  request: FastifyRequest<{ Params: { authId: string } }>,
  reply: FastifyReply
) {
  const m = /^Basic\s+(\S+)$/i.exec(request.headers.authorization ?? "");
  const decoded = m ? Buffer.from(m[1]!, "base64").toString("utf8") : "";
  const sep = decoded.indexOf(":");
  const authId = sep === -1 ? "" : decoded.slice(0, sep);
  const token = sep === -1 ? "" : decoded.slice(sep + 1);

  // The credential is only ever looked up by the id the caller proved knowledge of AND that matches the URL.
  const row = authId && authId === request.params.authId
    ? await request.server.prisma.apiKey.findUnique({ where: { id: authId } })
    : null;
  const hashOk = tokenMatchesHash(token, row?.keyHash ?? DUMMY_HASH);
  if (!row || !hashOk || row.revokedAt) return plivoError(reply, 401, BAD_CREDENTIALS);

  const org = await request.server.prisma.organization.findUnique({
    where: { id: row.organizationId },
    select: { status: true },
  });
  if (org?.status !== "active") return plivoError(reply, 403, "Account is not active");
  // Same body for "not allow-listed" and "blocked" so the reason is not revealed.
  if (!(await checkPublicApiAccess(request.server.prisma, row.organizationId)).allowed) {
    return plivoError(reply, 403, "API access is not available for this account");
  }

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    void request.server.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  request.publicApi = { apiKeyId: row.id, organizationId: row.organizationId };
}
