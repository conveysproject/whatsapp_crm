// Shared domain types for TrustCRM
// Expand these as features are built in Sprint 2+

export type OrganizationId = string & { readonly __brand: "OrganizationId" };
export type UserId = string & { readonly __brand: "UserId" };

export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export const API_VERSION = "v1" as const;
