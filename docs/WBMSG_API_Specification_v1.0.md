# WBMSG
# API Specification
## REST API v1 Reference
Version 1.0
April 2026
Strictly Confidential

| Document Owner | Backend Lead / API Architect |
| --- | --- |
| Base URL | https://api.WBMSG.com/v1 |
| Protocol | HTTPS only (TLS 1.3) |
| Format | JSON (application/json) |

# Table of Contents

# 1. Authentication
## 1.1 Overview
WBMSG API uses JWT (JSON Web Tokens) for authentication, managed by Clerk. All API requests must include a valid access token in the Authorization header.
## 1.2 Authentication Methods

| Method | Use Case | Header Format |
| --- | --- | --- |
| User JWT | Web app, mobile app user sessions | Authorization: Bearer &lt;jwt_token&gt; |
| API Key | Third-party integrations, server-to-server | X-API-Key: &lt;api_key&gt; |
| Webhook Signature | Incoming webhooks from WhatsApp, Stripe | X-Hub-Signature-256: sha256=... |

## 1.3 Example: Bearer Token Request
GET /v1/contacts
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

# 2. API Conventions
## 2.1 Response Format
Success Response (200/201):
{
&quot;data&quot;: { ... },
&quot;meta&quot;: {
&quot;timestamp&quot;: &quot;2026-04-26T10:30:00Z&quot;
}
}

Error Response (4xx/5xx):
{
&quot;error&quot;: {
&quot;code&quot;: &quot;RESOURCE_NOT_FOUND&quot;,
&quot;message&quot;: &quot;Contact with ID abc123 not found&quot;,
&quot;timestamp&quot;: &quot;2026-04-26T10:30:00Z&quot;
}
}

## 2.2 Pagination
List endpoints support cursor-based pagination with limit and cursor parameters:
GET /v1/contacts?limit=50&amp;cursor=eyJpZCI6ImFiYzEyMyJ9

Paginated Response:
{
&quot;data&quot;: [...],
&quot;pagination&quot;: {
&quot;next_cursor&quot;: &quot;eyJpZCI6Inh5ejc4OSJ9&quot;,
&quot;has_more&quot;: true
}
}

# 3. HTTP Status Codes

| Code | Status | Description |
| --- | --- | --- |
| 200 | OK | Request succeeded, response includes data |
| 201 | Created | Resource created successfully |
| 204 | No Content | Request succeeded, no response body (DELETE operations) |
| 400 | Bad Request | Invalid request syntax, missing required fields, validation errors |
| 401 | Unauthorized | Missing or invalid authentication credentials |
| 403 | Forbidden | Authenticated but insufficient permissions for this resource |
| 404 | Not Found | Requested resource does not exist |
| 429 | Too Many Requests | Rate limit exceeded, retry after header indicates when to retry |
| 500 | Internal Server Error | Unexpected server error, contact support with request ID |
| 503 | Service Unavailable | Temporary service outage or maintenance, retry with exponential backoff |

# 4. Contacts API
## 4.1 List Contacts
GET /v1/contacts
Retrieve a paginated list of contacts for the authenticated organization.
Query Parameters:

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| limit | integer | No | Results per page (default: 50, max: 100) |
| cursor | string | No | Pagination cursor from previous response |
| lifecycle_stage | string | No | Filter by: lead, prospect, customer, loyal, churned |
| tags | string | No | Comma-separated tags (AND logic) |

## 4.2 Create Contact
POST /v1/contacts
Create a new contact for the authenticated organization.
Request Body:
{
&quot;phone_number&quot;: &quot;+919876543210&quot;,
&quot;name&quot;: &quot;Rajesh Kumar&quot;,
&quot;email&quot;: &quot;rajesh@example.com&quot;,
&quot;company_id&quot;: &quot;uuid&quot;,
&quot;tags&quot;: [&quot;vip&quot;, &quot;e-commerce&quot;],
&quot;custom_fields&quot;: {
&quot;preferred_language&quot;: &quot;Hindi&quot;,
&quot;order_count&quot;: 12
}
}

# 5. Complete API Endpoint Reference
The following table summarizes all WBMSG API endpoints. Detailed specifications for each endpoint follow the patterns shown above.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | /v1/contacts | List all contacts |
| POST | /v1/contacts | Create a contact |
| GET | /v1/contacts/:id | Get contact by ID |
| PATCH | /v1/contacts/:id | Update contact |
| DELETE | /v1/contacts/:id | Delete contact |
| GET | /v1/conversations | List conversations (inbox) |
| GET | /v1/conversations/:id/messages | Get messages for conversation |
| POST | /v1/messages/send | Send a WhatsApp message |
| GET | /v1/templates | List WhatsApp message templates |
| POST | /v1/templates | Create template (submit to Meta for approval) |
| POST | /v1/campaigns | Create broadcast campaign |
| GET | /v1/analytics/trust-score | Get current Trust Score |
| GET | /v1/flows | List automation workflows |
| POST | /v1/flows | Create automation workflow |

# 6. Webhooks
WBMSG delivers real-time events via HTTP POST webhooks. Organizations can register webhook URLs to receive notifications about messages, conversation updates, and system events.
## 6.1 Available Events

| Event Type | Description |
| --- | --- |
| message.received | New inbound WhatsApp message |
| message.status_updated | Message delivery status changed (sent → delivered → read) |
| conversation.created | New conversation thread initiated |
| contact.created | New contact record created |
| template.status_updated | WhatsApp template approval status changed (pending → approved/rejected) |

End of API Specification Document
WBMSG v1.0 | April 2026 | Strictly Confidential