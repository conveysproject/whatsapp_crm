// Shared domain types for TrustCRM

export type OrganizationId = string & { readonly __brand: "OrganizationId" };
export type UserId = string & { readonly __brand: "UserId" };
export type InvitationId = string & { readonly __brand: "InvitationId" };
export type ConversationId = string & { readonly __brand: "ConversationId" };
export type MessageId = string & { readonly __brand: "MessageId" };
export type ContactId = string & { readonly __brand: "ContactId" };
export type CompanyId = string & { readonly __brand: "CompanyId" };
export type DealId = string & { readonly __brand: "DealId" };
export type PipelineId = string & { readonly __brand: "PipelineId" };
export type TemplateId = string & { readonly __brand: "TemplateId" };
export type SegmentId = string & { readonly __brand: "SegmentId" };
export type CampaignId = string & { readonly __brand: "CampaignId" };

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
