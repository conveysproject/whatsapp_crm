import { auth } from "@clerk/nextjs/server";
import type { ApiResponse, ApiError } from "@WBMSG/shared";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

export class ApiRequestError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error: ApiError }
      | null;
    throw new ApiRequestError(
      body?.error.code ?? "UNKNOWN",
      body?.error.message ?? `HTTP ${res.status}`
    );
  }

  return (res.json() as Promise<ApiResponse<T>>).then((r) => r.data);
}

export const api = {
  organizations: {
    me: () => apiFetch<OrganizationData>("/v1/organizations/me"),
    update: (data: { name?: string }) =>
      apiFetch<OrganizationData>("/v1/organizations/me", {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },
  users: {
    list: () => apiFetch<UserData[]>("/v1/users"),
    updateRole: (id: string, role: string) =>
      apiFetch<UserData>(`/v1/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/v1/users/${id}`, { method: "DELETE" }),
  },
  invitations: {
    create: (data: { email: string; role: string }) =>
      apiFetch<InvitationData>("/v1/invitations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },
};

export interface OrganizationData {
  id: string;
  name: string;
  planTier: string;
  settings: Record<string, unknown>;
  createdAt: string;
}

export interface UserData {
  id: string;
  email: string;
  fullName: string;
  role: string;
  createdAt: string;
}

export interface InvitationData {
  id: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
}
