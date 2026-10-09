// VERIFY every Meta code below against Meta's Cloud API error-code reference before release
// (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes). Plivo codes come from Plivo's error-code page.
const META_TO_PLIVO: Record<number, string> = {
  133010: "310", // phone number not registered
  131031: "360", // business account locked / disabled
  131051: "330", // unsupported message type
  132001: "340", // template does not exist
  132015: "340", // template paused
  132016: "340", // template disabled
  132000: "350", // template parameter count mismatch
  132005: "350", // translated text too long
  132012: "350", // template parameter format mismatch
  130429: "370", // Cloud API throughput reached
  131056: "370", // pair rate limit
  131048: "370", // spam rate limit
  131047: "380", // re-engagement: >24h since last customer reply
};

/**
 * Plivo-style ErrorCode for a Meta error. Codes we know map to Plivo's 3xx codes; any other valid Meta code is
 * passed through as its own digits (Meta codes are 6 digits, Plivo's are 3, so they cannot clash) so the client
 * and operators can always see the real reason instead of an empty ErrorCode.
 */
export function plivoErrorFromMeta(metaCode: number | null | undefined): string | null {
  if (metaCode == null || !Number.isInteger(metaCode) || metaCode <= 0) return null;
  return META_TO_PLIVO[metaCode] ?? String(metaCode);
}

// Sentences checked against Meta's Cloud API error-code reference (see task-5 report). Codes not confirmed there
// (e.g. Meta 200, whose meaning on that page is an access-token error, not a send-permission error) are left out
// and fall through to the generic sentence.
const MESSAGES: Record<string, string> = {
  "310": "The sending phone number is not registered on the WhatsApp Business Platform.",
  "330": "WhatsApp does not support this message type. Check the message type and try again.",
  "340": "The template does not exist in this language, is not approved, or has been paused or disabled. Check its status in WBMSG.",
  "350": "The template parameters do not match the template (count, format or length). Send values for every parameter in the format the template defines.",
  "360": "The WhatsApp Business account is restricted or failed verification. Contact support.",
  "370": "WhatsApp is limiting sending right now (throughput, messages to the same recipient, or a quality restriction). Slow down and retry later.",
  "380": "The customer has not replied in the last 24 hours, so only an approved template message can be sent.",
  "131047": "The customer has not replied in the last 24 hours, so only an approved template message can be sent.",
  "131049": "WhatsApp did not deliver this marketing message to this recipient to keep engagement healthy. Wait at least 24 hours before trying again.",
  "131026": "WhatsApp could not deliver the message. The recipient may not be a WhatsApp user, may not have accepted WhatsApp's terms, or may be on an outdated WhatsApp version.",
};

/** Readable sentence for the ErrorCode we report to the client (a 3xx status code or a passed-through Meta code). */
export function errorMessageForCode(code: string | null): string | null {
  if (!code) return null;
  return MESSAGES[code] ?? `WhatsApp could not deliver the message (code ${code}).`;
}
