import { facebookProvider } from "./facebook.js";
import { googleProvider } from "./google.js";
import type { OAuthProvider, OAuthProviderId } from "./types.js";

const PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  google: googleProvider,
  facebook: facebookProvider,
};

export function getOAuthProvider(id: string): OAuthProvider | null {
  return Object.prototype.hasOwnProperty.call(PROVIDERS, id) ? PROVIDERS[id as OAuthProviderId] : null;
}
