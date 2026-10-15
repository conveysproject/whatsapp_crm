import { ApiError, type Api } from "./api";

export type Role = "superAdmin" | "admin" | "manager" | "agent" | "viewer";
export interface Me {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  organizationId: string;
  availability: string;
  permissions: Record<string, string>;
}
export type Gate = { kind: "ok"; me: Me } | { kind: "super_admin" } | { kind: "no_account" } | { kind: "error"; message: string };

/** Decides whether the signed-in Clerk user may use the app. Super admins never use the mobile app (owner rule). */
export async function resolveGate(api: Api): Promise<Gate> {
  try {
    const { data } = await api<{ data: Me }>("/users/me");
    return data.role === "superAdmin" ? { kind: "super_admin" } : { kind: "ok", me: data };
  } catch (err) {
    if (err instanceof ApiError && [401, 403, 404].includes(err.status)) return { kind: "no_account" };
    return { kind: "error", message: (err as Error).message };
  }
}
