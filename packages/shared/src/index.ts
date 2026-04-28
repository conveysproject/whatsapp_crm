// Shared domain types for TrustCRM

export type OrganizationId = string & { readonly __brand: "OrganizationId" };
export type UserId = string & { readonly __brand: "UserId" };
export type InvitationId = string & { readonly __brand: "InvitationId" };

export type Role = "admin" | "manager" | "agent" | "viewer";
export type PlanTier = "starter" | "growth" | "scale" | "enterprise";

export interface ApiResponse<T> {
  data: T;
  meta?: {
    timestamp?: string;
    nextCursor?: string;
    hasMore?: boolean;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const API_VERSION = "v1" as const;
