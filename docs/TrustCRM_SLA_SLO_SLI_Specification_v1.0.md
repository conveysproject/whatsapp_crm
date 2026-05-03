# WBMSG
# SLA / SLO / SLI Specification
Service Level Agreements, Objectives &amp; Indicators (Google SRE Workbook)
Version 1.0  |  April 2026
Strictly Confidential
Document Owner
Head of Platform / SRE Lead
## 1. Purpose
This specification defines the measurable commitments WBMSG makes to customers (SLAs), the internal targets that engineering operates against (SLOs), and the underlying quantitative indicators (SLIs). It governs service credits, on-call alerting, error budgets, and the freeze policy when budgets are exhausted.
## 2. Definitions

| Term | Meaning |
| --- | --- |
| SLI | Service Level Indicator — a measured value (e.g., latency, error rate) |
| SLO | Service Level Objective — internal target for an SLI over a window |
| SLA | Service Level Agreement — externally-committed SLO with consequences (credits) |
| Error Budget | 1 − SLO. The allowable failure within the window before remediation |
| Burn Rate | Rate at which the error budget is consumed; multiplier of normal pace |
| Window | Measurement period (rolling 30 days unless stated) |

## 3. Service Tiering

| Tier | Customer Plans | Availability SLA | Credit Schedule |
| --- | --- | --- | --- |
| Tier-A | Enterprise | 99.95% | 10% per 0.1% miss, capped at 30% |
| Tier-B | Pro | 99.9% | 5% per 0.1% miss, capped at 20% |
| Tier-C | Starter | 99.5% | 5% per 0.5% miss, capped at 10% |
| Tier-D | Free | Best effort | No credit |

## 4. Service Catalogue &amp; SLOs
### 4.1 Inbox &amp; Messaging (User-Facing Critical)

| SLI | Definition | SLO | Tier |
| --- | --- | --- | --- |
| Availability | % successful HTTP requests on /api/v1/inbox/* | 99.95% | A |
| Latency p95 | Server-side response time, GET /conversations | ≤ 300 ms | A |
| Latency p99 | Server-side response time, GET /conversations | ≤ 800 ms | A |
| Webhook ingestion | Time from Meta POST to message-stored event | p95 ≤ 3 s | A |
| Send success rate | % sent messages accepted by Meta within 5 s | ≥ 99.5% | A |

### 4.2 Authentication &amp; Tenant Boundary

| SLI | Definition | SLO | Tier |
| --- | --- | --- | --- |
| Login success | % successful authentications (excluding wrong password) | ≥ 99.9% | A |
| Tenant-isolation breach | Number of cross-org reads detected | 0 | A |
| Auth latency p95 | Token validation latency | ≤ 100 ms | A |

### 4.3 Outbound Webhook &amp; API for Customers

| SLI | Definition | SLO | Tier |
| --- | --- | --- | --- |
| Webhook delivery (60s) | % events delivered with HTTP 2xx within 60 s | ≥ 99.95% | A |
| Webhook delivery (24h) | % events eventually delivered within 24 h | ≥ 99.99% | A |
| REST API availability | % successful 2xx/3xx on /api/v1/* | 99.9% | A |
| REST API latency p95 | GET endpoints | ≤ 300 ms | A |

### 4.4 Campaigns

| SLI | Definition | SLO | Tier |
| --- | --- | --- | --- |
| Campaign send throughput | Sustained msgs/sec per org at 80 msg/s plan | ≥ 80 msg/s | A |
| Campaign accuracy | % recipients matching segment criteria at send | 100% | A |
| Bulk import time | 50K row CSV import wall time | ≤ 90 s p95 | A |

### 4.5 AI Agent &amp; Inference

| SLI | Definition | SLO | Tier |
| --- | --- | --- | --- |
| AI inference latency p95 | Cached response | ≤ 1.2 s | B |
| AI inference latency p95 | Uncached response | ≤ 4.5 s | B |
| Hand-off accuracy | % AI hand-offs to human at correct intent | ≥ 95% | B |
| Provider failover RTO | Time to switch from primary LLM to fallback | ≤ 30 s | A |

### 4.6 Reports &amp; Analytics

| SLI | Definition | SLO | Tier |
| --- | --- | --- | --- |
| Dashboard load p95 | First paint of analytics dashboard | ≤ 2.5 s | B |
| Data freshness | Lag of facts vs source | ≤ 5 min | B |
| Report export | CSV export of 100K rows | ≤ 30 s | B |

## 5. Error Budget Policy
- Each SLO has an error budget = (1 − SLO) × measurement window.
- Example: 99.9% over 30 days = 43.2 min downtime budget.
- Burn-rate alerts (multi-window): 2% of monthly budget in 1 h → page; 5% in 6 h → page; 10% in 3 d → ticket.
- Budget exhausted → release freeze on the affected service until recovery + a buffer of 25% remaining.
- Budget surplus (&gt;50% remaining at end of month) → engineering may invest in higher-risk improvements.
## 6. Service Credits (Customer-Facing SLA Consequence)
### 6.1 Calculation
- Monthly SLA = (Total minutes − Excluded minutes − Downtime minutes) / (Total − Excluded).
- Excluded minutes: planned maintenance with ≥ 7 d notice; force majeure; customer-caused.
- Downtime: any window where availability SLI falls below the SLO target.
- Credits applied to next invoice; no refund of paid amounts.
- Customer must claim within 30 days of incident to be eligible.
### 6.2 Example
- Pro tier customer (99.9% SLA). Month had 65 min downtime.
- Actual availability = (43,200 − 65) / 43,200 = 99.85%.
- Miss = 99.9% − 99.85% = 0.05%. Below 0.1% threshold → no credit.
- If downtime had been 130 min (0.30% miss) → 5% × 3 = 15% credit.
## 7. Maintenance Windows
- Standard window: Saturday 02:00–04:00 IST. Up to 2 windows per month.
- Notice: ≥ 7 calendar days for any window with expected impact.
- Zero-downtime preferred — windows used only for high-risk migrations.
- Excluded from SLA calculation if notice given.
## 8. Exclusions
- Customer-caused (misuse of API, mis-configured webhook receiver).
- Force majeure (natural disaster, regulatory shutdown, cyber attack of national scale).
- Sub-processor outage where customer was offered a documented degraded mode.
- Beta features and Free tier services.
- Issues caused by customer's own integrations or code.
## 9. Reporting &amp; Transparency
- Public status page (status.WBMSG.in) shows real-time uptime per service.
- Monthly SLA report emailed to all paying customers by 10th of next month.
- Quarterly Service Review with Enterprise customers covering SLO attainment, incidents, capacity.
- Annual Trust Report published publicly summarising aggregate SLO attainment.
## 10. Internal Process
### 10.1 SLO Review
- Quarterly review by SRE Lead with engineering managers.
- Each SLO must have an owner and a documented runbook for breaches.
- New services have SLOs defined before GA — no SLO, no GA.
### 10.2 Alerting
- Multi-window multi-burn-rate alerting (Google SRE Workbook §5).
- Page only on user-impact; ticket on slow burns.
- Alert noise budget: ≤ 2 pages per on-call shift average.
### 10.3 Capacity Planning
- SLI dashboards include headroom estimate per service.
- Capacity review monthly; provisioning request triggered at 70% sustained utilisation.
- Annual scale exercise to validate capacity model up to 3-year target.
## 11. Version History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| 1.0 | 26-Apr-2026 | SRE Lead | Baseline at end of Sprint 0; pre-GA SLOs |

End of SLA/SLO/SLI Specification | WBMSG v1.0 | April 2026 | Google SRE Workbook