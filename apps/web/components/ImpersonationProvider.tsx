"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  IMPERSONATION_STORAGE_KEY,
  syncImpersonation,
  createImpersonatingFetch,
  parseImpersonationSession,
} from "@/lib/impersonation";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

/**
 * While an impersonation session exists in sessionStorage, adds X-Impersonate-Token to
 * API calls (API base or same-origin /api/v1 only). Renders nothing; mount before children
 * so it patches window.fetch before their effects issue requests.
 */
export function ImpersonationProvider(): null {
  useEffect(() => {
    const original = window.fetch;
    // Restore the session from the cookie in a new tab; API calls wait for this once.
    const ready = syncImpersonation();
    const patched = createImpersonatingFetch(
      original.bind(window),
      () => {
        try {
          const session = parseImpersonationSession(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY));
          if (!session) {
            // Expired or malformed: the banner owns cleanup (storage + cookie); just don't attach.
            return null;
          }
          return session.token;
        } catch {
          return null;
        }
      },
      { apiBase: API_URL, origin: window.location.origin },
      (code, message) => { toast.error(message, { id: code }); },
      ready,
    );
    window.fetch = patched;
    return () => {
      if (window.fetch === patched) window.fetch = original;
    };
  }, []);

  return null;
}
