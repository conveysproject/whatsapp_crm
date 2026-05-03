# WBMSG
# Technical Architecture Document
Version 1.0
April 2026
Strictly Confidential

| Document Owner | CTO / Technical Lead |
| --- | --- |
| Version | 1.0 — Complete Technical Specification |
| Date | April 2026 |
| Classification | Strictly Confidential |

# Table of Contents

# 1. Executive Summary
This document provides the complete technical architecture specification for WBMSG, a trust-first WhatsApp-native CRM platform designed for small and medium-sized businesses (SMBs). The architecture is designed to support high availability, scalability, and security while maintaining cost efficiency for an SMB-focused SaaS product.
Key Architecture Principles:
Multi-tenant architecture with database-level isolation using PostgreSQL Row Level Security
Microservices-oriented design with clear separation of concerns
Event-driven architecture for real-time features and asynchronous processing
API-first design enabling mobile, web, and third-party integrations
Zero-trust security model with end-to-end encryption
Cloud-native deployment on AWS with auto-scaling capabilities

# 2. Technology Stack
## 2.1 Frontend Technologies

| Layer | Technology | Purpose |
| --- | --- | --- |
| Web Frontend | Next.js 15 (App Router) + TypeScript | Server-side rendering, static optimization, API routes |
| UI Framework | React 18 + Tailwind CSS | Component library, utility-first styling |
| Mobile App | React Native + Expo | Cross-platform iOS + Android with OTA updates |
| State Management | Zustand + React Query | Client state management, server state caching |
| Real-time | Socket.io client | WebSocket connections for inbox updates |

## 2.2 Backend Technologies

| Layer | Technology | Purpose |
| --- | --- | --- |
| API Server | Node.js 20 + Fastify | High-throughput REST API, webhook handling |
| Database | PostgreSQL 16 (Aurora) | Primary datastore with JSONB support, Row Level Security |
| Cache &amp; Queue | Redis 7 + BullMQ | Session cache, job queues, pub/sub messaging |
| Search Engine | Meilisearch | Fast full-text search for contacts, conversations, messages |
| ML Service | Python 3.11 + FastAPI | Predictive analytics, churn models, LTV prediction |
| ORM | Prisma | Type-safe database access, migrations, schema management |

## 2.3 External Services &amp; APIs

| Service | Provider | Purpose |
| --- | --- | --- |
| WhatsApp API | Meta WhatsApp Cloud API | Message sending, receiving, template management |
| AI/LLM | Anthropic Claude API | Smart replies, intent detection, sentiment, summarization |
| Voice AI | OpenAI Whisper + ElevenLabs | Voice transcription (Whisper), text-to-speech (ElevenLabs) |
| Authentication | Clerk | User authentication, SSO, MFA, organization management |
| Billing | Stripe | Subscriptions, usage metering, invoicing, payment processing |
| File Storage | AWS S3 / Cloudflare R2 | Media storage, attachments, exports, voice notes |
| Email | Resend + Amazon SES | Transactional emails (Resend), bulk emails (SES) |
| Monitoring | Datadog + PagerDuty | APM, logging, alerts, on-call rotation |
| CDN | Cloudflare | Global edge caching, DDoS protection, WAF |

# 3. System Architecture
## 3.1 High-Level Architecture
WBMSG follows a modern cloud-native architecture pattern with the following key components:
Client Layer: Web application (Next.js), mobile apps (React Native), third-party API clients
Edge Layer: Cloudflare CDN for static assets, DDoS protection, and global distribution
API Gateway: AWS Application Load Balancer routing to Fastify API servers
Application Layer: Stateless API servers, webhook processors, real-time Socket.io servers
Processing Layer: Background job workers (BullMQ), ML prediction service (Python FastAPI)
Data Layer: PostgreSQL (primary), Redis (cache/queue/pubsub), Meilisearch (search), S3 (files)
Integration Layer: External API connectors (WhatsApp, Shopify, Clerk, Stripe, Claude, Whisper)

## 3.2 Multi-Tenancy Architecture
WBMSG uses a shared database multi-tenancy model with Row Level Security (RLS) for data isolation:
Single shared PostgreSQL database: All tenants share the same physical database instance for cost efficiency
Organization-scoped queries: Every query is automatically scoped to the authenticated organization via RLS policies
Database-level enforcement: Data isolation enforced at the PostgreSQL level, not application code
Instant tenant provisioning: New organizations created in milliseconds without database migrations
Schema evolution: Single schema version, all organizations get features simultaneously

RLS Implementation Pattern:
Every table has an organization_id column. RLS policies ensure that:
Users can only SELECT rows where organization_id matches their authenticated organization
INSERT operations automatically set organization_id to the authenticated organization
UPDATE and DELETE operations only affect rows matching the organization_id

# 4. Data Architecture
## 4.1 Database Schema Overview
The WBMSG database schema is organized into the following logical domains:
Core Entities: organizations, users, teams, roles
CRM Domain: contacts, companies, custom_fields, deals, pipelines, lifecycle_stages
Messaging Domain: conversations, messages, templates, campaigns, broadcasts
Automation Domain: flows, flow_nodes, flow_executions, triggers
Analytics Domain: events, metrics, predictions, trust_scores
Integration Domain: connected_accounts, webhooks, api_keys

## 4.2 Key Database Tables

| Table Name | Description &amp; Key Columns |
| --- | --- |
| organizations | Top-level tenant entity. Columns: id, name, plan_tier, whatsapp_business_account_id, settings (JSONB), created_at |
| contacts | Customer/lead records. Columns: id, organization_id, phone_number (unique per org), name, email, company_id, lifecycle_stage, custom_fields (JSONB), tags (text[]), created_at, updated_at |
| conversations | WhatsApp conversation threads. Columns: id, organization_id, contact_id, channel (whatsapp/instagram/facebook), status (open/closed/snoozed), assigned_to_user_id, labels (text[]), last_message_at, created_at |
| messages | Individual messages. Columns: id, conversation_id, direction (inbound/outbound), message_type (text/image/audio/document), content, media_url, metadata (JSONB for voice transcripts, AI classification), sent_at, delivered_at, read_at |
| deals | Sales pipeline deals. Columns: id, organization_id, pipeline_id, stage_id, contact_id, company_id, deal_value, expected_close_date, probability, custom_fields (JSONB), created_at, updated_at |
| templates | WhatsApp message templates. Columns: id, organization_id, name, category (marketing/utility/authentication), language, header_type, body_text, footer_text, buttons (JSONB), meta_template_id, meta_status (pending/approved/rejected), created_at |
| campaigns | Broadcast campaigns. Columns: id, organization_id, template_id, segment_id, scheduled_at, status (draft/scheduled/sending/completed/failed), total_recipients, delivered, read, replied, cost_meta_api, created_at |
| flows | Automation workflows. Columns: id, organization_id, name, trigger_type, trigger_config (JSONB), nodes (JSONB array of node definitions), is_active, created_at, updated_at |
| predictions | ML predictions. Columns: id, organization_id, contact_id, prediction_type (churn/ltv/upsell), value, confidence, features (JSONB), computed_at, expires_at |
| trust_scores | Trust Score snapshots. Columns: id, organization_id, score (0-100), dimension_scores (JSONB with 6 dimensions), recommendations (text[]), computed_at |

# 5. Infrastructure &amp; Deployment
## 5.1 AWS Infrastructure
WBMSG is deployed on AWS using a containerized, auto-scaling architecture:
Compute: AWS ECS Fargate (serverless containers) for stateless API and worker services
Database: Amazon RDS Aurora PostgreSQL with multi-AZ deployment, automated backups, read replicas
Cache: Amazon ElastiCache for Redis (cluster mode) with automatic failover
Load Balancing: Application Load Balancer with health checks, SSL termination, path-based routing
Storage: S3 for media files, exports, voice notes; Cloudflare R2 for backup/failover
Networking: VPC with public and private subnets, NAT gateways, security groups
DNS: Route 53 for domain management, health checks, failover routing
Secrets: AWS Secrets Manager for API keys, database credentials, encryption keys

## 5.2 Container Architecture
WBMSG runs the following containerized services on ECS:

| Service | Container Image | Scaling Policy |
| --- | --- | --- |
| api-server | node:20-alpine + Fastify | Auto-scale: 2-20 tasks based on CPU (target 70%) |
| webhook-processor | node:20-alpine + Fastify | Auto-scale: 2-10 tasks based on request count |
| realtime-server | node:20-alpine + Socket.io | Auto-scale: 2-10 tasks based on connection count |
| worker-general | node:20-alpine + BullMQ | Auto-scale: 1-5 tasks based on queue depth |
| worker-campaign | node:20-alpine + BullMQ | Auto-scale: 2-10 tasks based on broadcast queue depth |
| worker-voice | node:20-alpine + BullMQ | Auto-scale: 1-5 tasks based on voice queue depth |
| ml-service | python:3.11-slim + FastAPI | Fixed: 1-2 tasks, batch processing |

## 5.3 CI/CD Pipeline
Continuous integration and deployment via GitHub Actions:
Code Push: Developer pushes to feature branch
CI Checks: Automated tests, linting, type-checking run on GitHub Actions
PR Review: Code review required, CI must pass
Merge to Main: Automatic deploy to staging environment triggered
Build Images: Docker images built and pushed to Amazon ECR
Deploy to Staging: ECS service updated with new task definitions
Smoke Tests: Automated API tests run against staging
Manual Gate: Product/engineering approval required for production
Deploy to Production: Blue-green deployment with automatic rollback on health check failure

# 6. Security Architecture
## 6.1 Security Principles
Zero Trust: Never trust, always verify. Every request authenticated and authorized.
Defense in Depth: Multiple layers of security controls at network, application, and data levels
Least Privilege: Users, services, and processes have minimum necessary permissions
Encryption Everywhere: Data encrypted at rest (AES-256) and in transit (TLS 1.3)
Audit Everything: Comprehensive logging and audit trails for all sensitive operations

## 6.2 Authentication &amp; Authorization
Authentication via Clerk:
JWT-based authentication with short-lived access tokens (15 min expiry)
Refresh tokens stored securely in httpOnly cookies
Multi-factor authentication (MFA) required for Scale plan, optional for Growth
SSO support via SAML 2.0 (for Enterprise plan)
Session management with device tracking and remote logout

Authorization Model:
Role-Based Access Control (RBAC): Admin, Manager, Agent, Viewer roles per organization
Team-based permissions: Users can be assigned to teams with scoped access
Database-level RLS: Authorization enforced at PostgreSQL row level, not just application layer
API scopes: Third-party API keys have granular scopes (read:contacts, write:messages, etc.)

## 6.3 Data Protection
Encryption at Rest: RDS Aurora encrypted with AWS KMS, S3 buckets with server-side encryption
Encryption in Transit: TLS 1.3 for all API endpoints, WebSockets use WSS
Secrets Management: AWS Secrets Manager for API keys, credentials never in code or logs
PII Handling: Phone numbers hashed in logs, sensitive fields masked in non-production environments
Data Retention: Voice notes auto-deleted after 30 days, exports deleted after 7 days
Data Deletion: GDPR/DPDP-compliant deletion within 24 hours of request

## 6.4 Compliance &amp; Auditing
SOC 2 Type II: Target Month 18, third-party audit, annual recertification
India DPDP Act: Data localization, consent management, deletion rights built-in
VAPT: Vulnerability assessment and penetration testing every 6 months
Audit Logs: All user actions, API calls, data exports logged with timestamp, user, IP, action
Incident Response: 24/7 monitoring, PagerDuty on-call, documented incident response playbook

# 7. Scalability &amp; Performance
## 7.1 Performance Targets

| Metric | Target |
| --- | --- |
| API Response Time (p95) | &lt;300ms for read operations, &lt;800ms for writes |
| Webhook Processing Latency (p99) | &lt;2 seconds from WhatsApp webhook to database write |
| Real-time Update Latency | &lt;500ms from event to Socket.io broadcast |
| Voice Transcription Latency (p99) | &lt;5 seconds for 60-second voice note |
| Campaign Send Rate | 1,000 messages/hour per account (configurable) |
| Database Query Performance (p95) | &lt;50ms for indexed queries, &lt;200ms for analytics |
| Uptime SLA | 99.9% uptime (published SLA with automatic credits) |

## 7.2 Scaling Strategy
Horizontal Scaling:
Stateless API servers: Add more ECS tasks when CPU &gt;70% or request count &gt;1000/min per task
Worker auto-scaling: BullMQ workers scale based on queue depth (add 1 worker per 100 waiting jobs)
Database read replicas: Analytics and reporting queries routed to read replicas
Redis cluster mode: Automatic sharding across nodes for cache and queue distribution

Vertical Scaling:
Database: Aurora can scale vertically to larger instance types if IOPS become bottleneck
Redis: ElastiCache supports on-demand node resizing

Caching Strategy:
Contact profiles: Cached in Redis for 15 minutes, invalidated on update
Templates: Cached indefinitely, invalidated on Meta approval status change
Analytics: Pre-aggregated daily, cached for 1 hour
Trust Scores: Cached until next nightly computation job

# 8. Monitoring &amp; Observability
## 8.1 Monitoring Stack
APM: Datadog APM for distributed tracing, service maps, performance bottlenecks
Logs: Centralized logging to Datadog Logs, structured JSON logs, retention 30 days
Metrics: Custom business metrics (messages sent, campaigns launched, churn rate) in Datadog
Synthetics: Datadog Synthetic Monitoring for API health checks every 1 min from 3 regions
Alerts: PagerDuty integration for critical alerts, Slack for warnings
Status Page: Public status.WBMSG.com showing real-time uptime, incident history

## 8.2 Key Metrics Dashboard
Infrastructure Metrics:
API server: CPU, memory, request rate, error rate, p50/p95/p99 latency
Database: Connections, CPU, IOPS, query duration, deadlocks, replication lag
Redis: Cache hit rate, evictions, memory usage, connection count
Queues: Queue depth per queue, processing time, failed jobs, retry count

Business Metrics:
Messages sent per hour, delivery rate, read rate
Active organizations, weekly active businesses (WAB)
Campaign success rate, opt-out rate
Average Trust Score across all organizations
AI API costs per organization

# 9. Disaster Recovery &amp; Business Continuity
## 9.1 Backup Strategy
Database: Aurora automated backups daily, 35-day retention, continuous backup to S3
Point-in-time Recovery: Restore to any point within last 35 days
Cross-Region Replication: Aurora replicated to secondary AWS region (us-west-2) for disaster recovery
Redis: Daily snapshots, 7-day retention
S3: Versioning enabled, lifecycle policy moves to Glacier after 90 days

## 9.2 Disaster Recovery Plan
Recovery Time Objective (RTO): 4 hours
Recovery Point Objective (RPO): 15 minutes (maximum data loss)
Disaster Scenarios:
Primary Database Failure: Aurora Multi-AZ automatic failover &lt;60 seconds
Regional Outage: Manual failover to secondary region, DNS cutover, ~2 hours
Data Corruption: Point-in-time restore from automated backup
Security Breach: Incident response playbook, rotate all secrets, audit logs, forensics

# 10. Appendix
## 10.1 Glossary

| Term | Definition |
| --- | --- |
| RLS | Row Level Security - PostgreSQL feature enforcing data isolation per organization |
| ECS | Elastic Container Service - AWS managed container orchestration platform |
| Fargate | Serverless compute engine for containers, no EC2 instance management required |
| BullMQ | Redis-based job queue library for Node.js with priority, retry, and scheduling |
| Aurora | AWS managed PostgreSQL-compatible database with auto-scaling, automated backups, and multi-AZ replication |
| Prisma | Type-safe ORM for Node.js and TypeScript, handles database schema and migrations |
| Meilisearch | Open-source search engine with typo-tolerance, instant results, and faceted filtering |
| APM | Application Performance Monitoring - tracks service health, response times, errors, dependencies |
| RTO | Recovery Time Objective - maximum acceptable downtime after a disaster |
| RPO | Recovery Point Objective - maximum acceptable data loss measured in time |

End of Technical Architecture Document
WBMSG v1.0 | April 2026 | Strictly Confidential