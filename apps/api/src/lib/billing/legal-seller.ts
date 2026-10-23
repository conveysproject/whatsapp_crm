// The legal seller of every WBMSG statement. One source of truth for the statement PDF, the default billing
// configuration and the footer of billing emails sent under a client's white-label brand (decision D4).
// Tax identifiers are not here: they are owner-configured per deployment (billing config `seller`) and printed on
// the statement PDF; this module never invents one.

export const LEGAL_SELLER_NAME = "Conveys Information Technology";
export const LEGAL_SELLER_EMAIL = "info@conveys.in";

/** The seller line every branded billing email carries in its footer. */
export const LEGAL_SELLER_LINE = `${LEGAL_SELLER_NAME}, ${LEGAL_SELLER_EMAIL}`;
