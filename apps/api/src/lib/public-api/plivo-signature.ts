import { createHmac, randomInt } from "node:crypto";

/** scheme://host/path with no query or fragment (mirrors plivo-python `urlunparse((scheme, netloc, path, '', '', ''))`). */
function baseUrl(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

export function signV2(url: string, nonce: string, authToken: string): string {
  return createHmac("sha256", authToken).update(baseUrl(url) + nonce).digest("base64");
}

export function newNonce(): string {
  return `${randomInt(0, 1e10)}${randomInt(0, 1e10)}`.padStart(20, "0");
}
