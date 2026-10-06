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
