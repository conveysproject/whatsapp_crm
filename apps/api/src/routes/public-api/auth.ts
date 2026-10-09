import type { FastifyReply, FastifyRequest } from "fastify";
import { tokenMatchesHash } from "../../lib/public-api/credentials.js";
import { apiError } from "../../lib/public-api/responses.js";
import { checkPublicApiAccess } from "../../lib/public-api/access.js";

const DUMMY_HASH = "0".repeat(64); // keeps the compare cost constant when the credential does not exist
const LAST_USED_REFRESH_MS = 5 * 60 * 1000;

export async function publicApiAuth(
  request: FastifyRequest<{ Params: { authId: string } }>,
  reply: FastifyReply
) {
  const header = request.headers.authorization;
  if (!header) return apiError(reply, 401, "AUTH_MISSING");
  const m = /^Basic\s+(\S+)$/i.exec(header);
  const decoded = m ? Buffer.from(m[1]!, "base64").toString("utf8") : "";
  const sep = decoded.indexOf(":");
  if (!m || sep === -1) return apiError(reply, 401, "AUTH_MALFORMED");
  const authId = decoded.slice(0, sep);
  const token = decoded.slice(sep + 1);
  // Both values are the caller's own input, so naming this mismatch reveals nothing about stored credentials.
  if (authId !== request.params.authId) return apiError(reply, 401, "AUTH_ID_MISMATCH");

  // The credential is only ever looked up by the id the caller proved knowledge of AND that matches the URL.
  const row = authId ? await request.server.prisma.apiKey.findUnique({ where: { id: authId } }) : null;
  // Usage attribution only (no effect on the response): a wrong token against a real credential counts as that credential's failure.
  if (row) request.publicApiAttempt = { apiKeyId: row.id, organizationId: row.organizationId };
  const hashOk = tokenMatchesHash(token, row?.keyHash ?? DUMMY_HASH);
  // Unknown id, wrong token and revoked credential are deliberately indistinguishable.
  if (!row || !hashOk || row.revokedAt) return apiError(reply, 401, "AUTH_INVALID");

  const org = await request.server.prisma.organization.findUnique({
    where: { id: row.organizationId },
    select: { status: true },
  });
  if (org?.status !== "active") return apiError(reply, 403, "ACCOUNT_INACTIVE");
  // Same body for "not allow-listed" and "blocked" so the reason is not revealed.
  if (!(await checkPublicApiAccess(request.server.prisma, row.organizationId)).allowed) {
    return apiError(reply, 403, "API_NOT_AVAILABLE");
  }

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_REFRESH_MS) {
    void request.server.prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  request.publicApi = { apiKeyId: row.id, organizationId: row.organizationId };
}
