"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import {
  IMPERSONATION_STORAGE_KEY,
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
    const patched = createImpersonatingFetch(
      original.bind(window),
      () => {
        try {
          const session = parseImpersonationSession(sessionStorage.getItem(IMPERSONATION_STORAGE_KEY));
          if (!session) {
            // Expired or malformed: drop it so the UI falls back to the real account.
            if (sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)) sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
            return null;
          }
          return session.token;
        } catch {
          return null;
        }
      },
      { apiBase: API_URL, origin: window.location.origin },
      (code, message) => { toast.error(message, { id: code }); },
    );
    window.fetch = patched;
    return () => {
      if (window.fetch === patched) window.fetch = original;
    };
  }, []);

  return null;
}
