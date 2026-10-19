import { ApiError, type Api } from "./api";

export type Role = "superAdmin" | "admin" | "manager" | "agent" | "viewer" | "whatsappAdmin";
export interface Me {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  organizationId: string;
  availability: string;
  permissions: Record<string, string>;
}
export type Gate = { kind: "ok"; me: Me } | { kind: "super_admin" } | { kind: "web_only" } | { kind: "no_account" } | { kind: "error"; message: string };

/**
 * Decides whether the signed-in user may use the app. Super admins never use the mobile app (owner rule).
 * WhatsApp Admins only manage the WhatsApp account, which is web-only (docs/prd-whatsapp-admin-role.md).
 */
export async function resolveGate(api: Api): Promise<Gate> {
  try {
    const { data } = await api<{ data: Me }>("/users/me");
    if (data.role === "superAdmin") return { kind: "super_admin" };
    if (data.role === "whatsappAdmin") return { kind: "web_only" };
    return { kind: "ok", me: data };
  } catch (err) {
    // 403: API returns FORBIDDEN for a user with no DB row. 401 (expired/invalid token) stays retryable.
    if (err instanceof ApiError && [403, 404].includes(err.status)) return { kind: "no_account" };
    return { kind: "error", message: (err as Error).message };
  }
}
