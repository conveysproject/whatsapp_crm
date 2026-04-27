# TrustCRM
# Database Schema Specification
## Complete Data Model
Version 1.0
April 2026
Strictly Confidential

| Document Owner | Database Architect / Backend Lead |
| --- | --- |
| Database | PostgreSQL 16 (Amazon RDS Aurora) |
| ORM | Prisma |
| Total Tables | 32 tables across 6 logical domains |

# Table of Contents

# 1. Schema Overview
The TrustCRM database schema is organized into six logical domains, each representing a distinct area of functionality. All tables include organization_id for multi-tenant data isolation enforced through PostgreSQL Row Level Security (RLS).
## 1.1 Schema Domains

| Domain | Tables | Description |
| --- | --- | --- |
| Core | 5 | Organizations, users, teams, authentication, billing |
| CRM | 8 | Contacts, companies, deals, pipelines, custom fields, lifecycle stages |
| Messaging | 7 | Conversations, messages, templates, campaigns, broadcasts, channels |
| Automation | 4 | Flows, flow executions, triggers, chatbots |
| Analytics | 4 | Events, metrics, predictions, trust scores |
| Integration | 4 | Connected accounts, webhooks, API keys, product catalog |

# 2. Core Domain Tables
## 2.1 organizations
Description: Top-level tenant entity. Each organization represents a separate business using TrustCRM.

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| id | UUID | PRIMARY KEY | Unique organization identifier |
| name | VARCHAR(255) | NOT NULL | Business name |
| plan_tier | ENUM | NOT NULL | starter, growth, scale, enterprise |
| whatsapp_business_account_id | VARCHAR(50) | UNIQUE | Meta WABA ID |
| phone_number_id | VARCHAR(50) | UNIQUE | Meta phone number ID |
| settings | JSONB | DEFAULT &apos;{}&apos; | Organization preferences, feature flags |
| created_at | TIMESTAMP | DEFAULT NOW() | Account creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

Indexes:
UNIQUE INDEX on whatsapp_business_account_id
UNIQUE INDEX on phone_number_id

## 2.2 users
Description: Individual user accounts. Users belong to one or more organizations.

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| id | UUID | PRIMARY KEY | User identifier (from Clerk) |
| organization_id | UUID | FK, NOT NULL | References organizations(id) |
| email | VARCHAR(255) | NOT NULL, UNIQUE | User email address |
| full_name | VARCHAR(255) | NOT NULL | User display name |
| role | ENUM | NOT NULL | admin, manager, agent, viewer |
| is_active | BOOLEAN | DEFAULT TRUE | Account active status |
| created_at | TIMESTAMP | DEFAULT NOW() | User creation timestamp |

Indexes:
INDEX on organization_id (for RLS filtering)
UNIQUE INDEX on email

# 3. CRM Domain Tables
## 3.1 contacts
Description: Customer and lead records with unlimited custom fields via JSONB.

| Column | Type | Constraints | Description |
| --- | --- | --- | --- |
| id | UUID | PRIMARY KEY | Contact identifier |
| organization_id | UUID | FK, NOT NULL | References organizations(id) |
| phone_number | VARCHAR(20) | NOT NULL | E.164 format: +919876543210 |
| name | VARCHAR(255) |  | Contact full name |
| email | VARCHAR(255) |  | Email address |
| company_id | UUID | FK | References companies(id) |
| lifecycle_stage | VARCHAR(50) | DEFAULT &apos;lead&apos; | lead, prospect, customer, loyal, churned |
| tags | TEXT[] | DEFAULT &apos;{}&apos; | Array of tag strings |
| custom_fields | JSONB | DEFAULT &apos;{}&apos; | Unlimited custom field key-value pairs |
| created_at | TIMESTAMP | DEFAULT NOW() | Contact creation timestamp |
| updated_at | TIMESTAMP | DEFAULT NOW() | Last update timestamp |

Indexes:
UNIQUE INDEX on (organization_id, phone_number) - prevents duplicate contacts per org
INDEX on organization_id (for RLS filtering)
INDEX on lifecycle_stage (for segment queries)
GIN INDEX on tags (for array containment queries)
GIN INDEX on custom_fields (for JSONB queries)

# 4. Complete Table List
The following tables complete the TrustCRM schema. Full specifications for each table follow the same pattern as shown above.
## 4.1 All Tables by Domain

| Domain | Table Name | Purpose |
| --- | --- | --- |
| Core | organizations, users, teams, team_members, billing_subscriptions | Account structure, users, team management, billing |
| CRM | contacts, companies, deals, pipelines, pipeline_stages, custom_field_definitions, contact_activities, segments | Complete CRM with contacts, companies, deal pipelines, custom fields, activity tracking |
| Messaging | conversations, messages, templates, campaigns, broadcast_recipients, channels, message_read_status | WhatsApp messaging, templates, broadcasts, multi-channel support |
| Automation | flows, flow_executions, flow_execution_logs, chatbots | Workflow automation, chatbot logic, execution tracking |
| Analytics | events, metrics_snapshots, predictions, trust_scores | Event tracking, metrics, ML predictions, Trust Score computation |
| Integration | connected_accounts, webhooks, api_keys, products | External integrations (Shopify, etc.), webhook delivery, API access, product catalog |

# 5. Row Level Security (RLS) Implementation
Every table with organization_id has RLS policies to enforce multi-tenant data isolation at the database level.
## 5.1 Standard RLS Policy Pattern
Example for contacts table:
CREATE POLICY org_isolation_policy ON contacts
USING (organization_id = current_setting(&apos;app.current_organization_id&apos;)::UUID);

How it works:
At the start of each database session, the application sets current_organization_id based on the authenticated user&apos;s JWT
All SELECT, INSERT, UPDATE, DELETE queries are automatically filtered to match this organization_id
Cross-tenant data access is architecturally impossible - even with SQL injection, users can only see their own data
RLS policies are enforced by PostgreSQL itself, not application code

# 6. Database Relationships
Key Foreign Key Relationships:
users.organization_id → organizations.id (many-to-one)
contacts.organization_id → organizations.id (many-to-one)
contacts.company_id → companies.id (many-to-one)
conversations.contact_id → contacts.id (many-to-one)
messages.conversation_id → conversations.id (many-to-one)
deals.contact_id → contacts.id (many-to-one)
deals.pipeline_id → pipelines.id (many-to-one)
deals.stage_id → pipeline_stages.id (many-to-one)
campaigns.template_id → templates.id (many-to-one)
campaigns.segment_id → segments.id (many-to-one)
flow_executions.flow_id → flows.id (many-to-one)
predictions.contact_id → contacts.id (many-to-one)

End of Database Schema Document
TrustCRM v1.0 | April 2026 | Strictly Confidential