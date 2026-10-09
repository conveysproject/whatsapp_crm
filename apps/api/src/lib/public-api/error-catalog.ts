import { randomUUID } from "node:crypto";

/** The ONLY place public-API error codes, sentences and hints are defined. */
export const ERROR_CATALOG = {
  REQUEST_FAILED: { message: "The request could not be completed." },
  INVALID_JSON: { message: "The request body is not valid JSON.", hint: "Send a JSON object with Content-Type: application/json." },
  EMPTY_BODY: { message: "The request body is empty.", hint: "Send a JSON object with Content-Type: application/json." },
  UNSUPPORTED_CONTENT_TYPE: { message: "Content-Type must be application/json.", hint: "Add the header Content-Type: application/json." },
  BODY_TOO_LARGE: { message: "The request body is too large.", hint: "Reduce the size of the request." },
  VALIDATION_FAILED: { message: "The request is invalid.", hint: "Fix the field named in the message and send again." },
  TEMPLATE_PARAMS_MISMATCH: { message: "The template parameters do not match the template.", hint: "Send one parameter for every variable in the template body and header, using the same names (or numbers) as the template." },
  TEMPLATE_NOT_FOUND: { message: "Template not found.", hint: "Check the template name and language in your WBMSG account." },
  TEMPLATE_NOT_APPROVED: { message: "The template is not approved.", hint: "Only approved templates can be sent. Check its status in your WBMSG account." },
  AUTH_MISSING: { message: "The Authorization header is missing.", hint: "Use HTTP Basic auth: auth_id as the username and the auth token as the password." },
  AUTH_MALFORMED: { message: "The Authorization header is not valid Basic auth.", hint: "Use HTTP Basic auth: base64(auth_id:auth_token)." },
  AUTH_ID_MISMATCH: { message: "The auth_id in the URL does not match the username in the Authorization header.", hint: "Use the same auth_id in /v1/Account/{auth_id}/ and as the Basic-auth username." },
  AUTH_INVALID: { message: "The auth_id or auth token is invalid, or the credential was revoked.", hint: "Check both values, or create a new credential in WBMSG under Settings > API Credentials." },
  ACCOUNT_INACTIVE: { message: "This account is not active.", hint: "Contact WBMSG support." },
  API_NOT_AVAILABLE: { message: "API access is not available for this account.", hint: "Contact WBMSG support to enable it." },
  NOT_FOUND: { message: "The requested resource was not found.", hint: "Check the URL path and the id in it." },
  MESSAGE_NOT_FOUND: { message: "Message not found.", hint: "Check the message_uuid; it must belong to this account." },
  WHATSAPP_NOT_CONNECTED: { message: "No WhatsApp number is connected to this account.", hint: "Connect a WhatsApp Business number in WBMSG first." },
  SRC_MISMATCH: { message: "src is not the WhatsApp Business number connected to this account.", hint: "Set src to the connected number." },
  CALLBACK_URL_INVALID: { message: "The callback url is not allowed.", hint: "Use a public https URL." },
  QUEUE_FAILED: { message: "We could not queue your message.", hint: "Retry in a few seconds. If it keeps failing, contact support and quote the api_id." },
  RATE_LIMITED: { message: "Too many requests.", hint: "Wait a few seconds and retry; see the Retry-After header." },
  INTERNAL_ERROR: { message: "Something went wrong on our side. Your request was not processed.", hint: "Retry in a few seconds. If it keeps failing, contact support and quote the api_id." },
  META_UNAVAILABLE: { message: "WhatsApp (Meta) did not accept the request right now.", hint: "Retry later. If it keeps failing, contact support and quote the api_id." },
} as const satisfies Record<string, { message: string; hint?: string }>;

export type ApiErrorCode = keyof typeof ERROR_CATALOG;

export interface ApiErrorBody { api_id: string; error: string; error_code: string; hint?: string }

export function apiErrorBody(code: ApiErrorCode, opts: { message?: string; hint?: string; apiId?: string } = {}): ApiErrorBody {
  const base = ERROR_CATALOG[code] as { message: string; hint?: string };
  const hint = opts.hint ?? base.hint;
  return { api_id: opts.apiId ?? randomUUID(), error: opts.message ?? base.message, error_code: code, ...(hint ? { hint } : {}) };
}
