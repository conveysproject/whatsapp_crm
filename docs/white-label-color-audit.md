# White-label color audit (Task A5b)

Brand scale `brand-50..900` equals Tailwind `green-50..900` exactly for the default brand, so `green-N` -> `brand-N` is a no-op by default and follows a client's brand otherwise. `green-950`, `emerald-*`, `teal-*` are different colors and are never converted.

Scope: `apps/web/app` and `apps/web/components`, non-test files. Counts are class/hex occurrences. ACCENT = converted to `brand-N`; KEEP = left as is, with a reason. Files marked MIXED have both; their kept lines are listed in `apps/web/lib/brand-accents.test.ts` (KEPT_GREEN).

## Totals

- ACCENT converted: 164 class uses in 50 files
- KEEP (class uses): 235 in 70 files
  - semantic: 111
  - whatsapp: 58
  - billing: 37
  - admin: 14
  - auth: 13
  - public: 2
- Hex literals: 10 files (see below)
- emerald-*/teal-*: kept everywhere (different colors; 19 files, not brand-scale)
- green-950: kept (only in billing and the dashboard 'all good' banner/usage pill, dark mode)

## ACCENT (converted green-N -> brand-N)

| File | Converted | Also kept (MIXED) |
|---|---|---|
| app/(dashboard)/contacts/[id]/ContactDealsTab.tsx | 4 | 2 |
| app/(dashboard)/contacts/[id]/ContactTimeline.tsx | 1 | 1 |
| app/(dashboard)/deals/page.tsx | 6 |  |
| app/(dashboard)/flows/ai-intent-matching/page.tsx | 3 | 4 |
| app/(dashboard)/flows/basic-automation/business-hours-card.tsx | 1 | 1 |
| app/(dashboard)/flows/basic-automation/delayed-card.tsx | 1 | 1 |
| app/(dashboard)/flows/basic-automation/ooo-card.tsx | 1 | 1 |
| app/(dashboard)/flows/basic-automation/welcome-card.tsx | 1 | 1 |
| app/(dashboard)/parent/[childId]/page.tsx | 2 |  |
| app/(dashboard)/parent/page.tsx | 2 |  |
| app/(dashboard)/settings/ai/page.tsx | 7 |  |
| app/(dashboard)/settings/api-usage/page.tsx | 1 |  |
| app/(dashboard)/settings/contact-settings/tabs/CustomFieldsManager.tsx | 4 |  |
| app/(dashboard)/settings/notifications/page.tsx | 1 |  |
| app/(dashboard)/settings/roles/page.tsx | 4 | 1 |
| app/(dashboard)/settings/security/page.tsx | 4 | 1 |
| app/(dashboard)/settings/vendor-settings/page.tsx | 4 |  |
| app/(dashboard)/settings/webhook-actions/page.tsx | 4 |  |
| app/(dashboard)/templates/TemplateActions.tsx | 18 | 3 |
| app/(onboarding)/checklist/page.tsx | 3 | 1 |
| app/(onboarding)/connect-waba/page.tsx | 1 |  |
| app/(onboarding)/invite-team/page.tsx | 3 | 1 |
| app/(onboarding)/provision-number/page.tsx | 2 |  |
| components/analytics/TeamLeaderboard.tsx | 1 | 1 |
| components/bot-panel.tsx | 2 |  |
| components/dashboard/CampaignFunnel.tsx | 2 | 3 |
| components/dashboard/HeadsUpCard.tsx | 2 |  |
| components/dashboard/KpiGrid.tsx | 2 | 2 |
| components/dashboard/RangePicker.tsx | 1 |  |
| components/deals/AddDealModal.tsx | 7 |  |
| components/deals/CreateOfferModal.tsx | 9 | 1 |
| components/deals/CreatePipelineModal.tsx | 4 |  |
| components/deals/DealSlideOver.tsx | 9 |  |
| components/inbox/ContactPanel.tsx | 2 | 1 |
| components/inbox/ConversationHeader.tsx | 2 | 1 |
| components/inbox/SendMessageForm.tsx | 6 |  |
| components/inbox/TemplatePicker.tsx | 5 | 4 |
| components/media-url-field.tsx | 1 |  |
| components/parent/InviteClientForm.tsx | 2 | 1 |
| components/permissions-grid.tsx | 1 |  |
| components/segments/SegmentBuilderV2.tsx | 2 |  |
| components/settings/api-usage/CallbackAttempts.tsx | 1 |  |
| components/settings/api-usage/UsageTables.tsx | 2 | 2 |
| components/settings/ApiCredentialsSection.tsx | 4 | 2 |
| components/settings/CredentialRevealDialog.tsx | 4 |  |
| components/settings/SecuritySignInMethods.tsx | 3 |  |
| components/templates/analytics/AnalyticsHeader.tsx | 3 | 5 |
| components/ui/NewBadge.tsx | 2 |  |
| components/voice-player.tsx | 5 |  |
| components/whatsapp/ConnectWhatsAppModal.tsx | 2 | 13 |

## KEEP (green classes left unchanged)

| File | Uses | Category | Reason |
|---|---|---|---|
| app/admin/(protected)/audit-logs/page.tsx | 2 | admin | super-admin console is WBMSG's own |
| app/admin/(protected)/organizations/[id]/page.tsx | 7 | admin | super-admin console is WBMSG's own |
| app/admin/(protected)/organizations/page.tsx | 4 | admin | super-admin console is WBMSG's own |
| app/admin/(protected)/platform-config/page.tsx | 1 | admin | super-admin console is WBMSG's own |
| app/invitations/[token]/accept/page.tsx | 7 | auth | auth/invitation surface, handled in task A6 |
| components/parent/ClientAcceptView.tsx | 6 | auth | auth/invitation surface, handled in task A6 |
| app/(dashboard)/settings/billing/BillingClient.tsx | 8 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/AlertPreferences.tsx | 1 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/BandProgress.tsx | 5 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/BandTable.tsx | 1 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/BillingDetailsCard.tsx | 3 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/HowYouPayCard.tsx | 2 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/LaunchConfirmDialog.tsx | 4 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/MessageUsagePanel.tsx | 5 | billing | billing pages stay WBMSG-branded (D4a) |
| components/billing/UsageDetails.tsx | 1 | billing | billing pages stay WBMSG-branded (D4a) |
| components/layout/UsagePill.tsx | 7 | billing | usage indicator that links to billing (D4a); unsure, kept |
| components/public/LegalPage.tsx | 2 | public | public marketing/docs/legal: always the WBMSG product |
| app/(dashboard)/campaigns/[id]/page.tsx | 2 | semantic | positive metric / trend / resolved / read count |
| app/(dashboard)/campaigns/new/page.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/contacts/[id]/ContactDealsTab.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/contacts/[id]/ContactDetailHeader.tsx | 4 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/contacts/[id]/ContactDetailSidebar.tsx | 6 | semantic | trust-score level (high = good) and enabled/opt-in status |
| app/(dashboard)/contacts/[id]/ContactTimeline.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/contacts/import/steps/Step1Upload.tsx | 3 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/contacts/import/steps/Step4Progress.tsx | 4 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/contacts/segments/[id]/page.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/flows/ai-intent-matching/page.tsx | 4 | semantic | mock bot-reply preview and completed-step check |
| app/(dashboard)/flows/auto-replies-section.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/flows/basic-automation/business-hours-card.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/flows/basic-automation/delayed-card.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/flows/basic-automation/ooo-card.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/flows/basic-automation/welcome-card.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/messages/page.tsx | 9 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/settings/roles/page.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/settings/security/page.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/templates/TemplateActions.tsx | 3 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/templates/TemplateActiveTab.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(dashboard)/templates/TemplateRow.tsx | 2 | semantic | delivered/sent/read funnel and quality-rating colors |
| app/(dashboard)/trust-score/page.tsx | 3 | semantic | trust-score level (high = good) and enabled/opt-in status |
| app/(onboarding)/checklist/page.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| app/(onboarding)/invite-team/page.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/analytics/MetricCard.tsx | 1 | semantic | positive metric / trend / resolved / read count |
| components/analytics/MyWorkSection.tsx | 1 | semantic | positive metric / trend / resolved / read count |
| components/analytics/PredictiveTab.tsx | 4 | semantic | positive metric / trend / resolved / read count |
| components/analytics/TeamLeaderboard.tsx | 1 | semantic | positive metric / trend / resolved / read count |
| components/analytics/TeamTab.tsx | 1 | semantic | positive metric / trend / resolved / read count |
| components/dashboard/AttentionList.tsx | 5 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/dashboard/CampaignFunnel.tsx | 3 | semantic | delivered/sent/read funnel and quality-rating colors |
| components/dashboard/KpiGrid.tsx | 2 | semantic | positive metric / trend / resolved / read count |
| components/deals/CreateOfferModal.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/flows/FlowEditor.tsx | 5 | semantic | flow active status and 'Yes' branch |
| components/flows/FlowLogsTab.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/flows/nodes/ConditionNode.tsx | 2 | semantic | flow active status and 'Yes' branch |
| components/inbox/ContactPanel.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/inbox/ConversationHeader.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/inbox/TemplatePicker.tsx | 4 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/intent-badge.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/parent/InviteClientForm.tsx | 1 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/settings/api-usage/UsageTables.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/settings/ApiCredentialsSection.tsx | 2 | semantic | success / saved / active / completed / delivered status or confirmation |
| components/templates/analytics/AnalyticsHeader.tsx | 5 | semantic | delivered/sent/read funnel and quality-rating colors |
| components/templates/analytics/FunnelBars.tsx | 1 | semantic | delivered/sent/read funnel and quality-rating colors |
| components/trust-score/ContactTrustBadge.tsx | 3 | semantic | trust-score level (high = good) and enabled/opt-in status |
| components/ui/Badge.tsx | 2 | semantic | generic semantic 'green' badge variant |
| components/ui/Toast.tsx | 1 | semantic | success toast |
| app/(dashboard)/flows/basic-automation/automation-message-card.tsx | 1 | whatsapp | WhatsApp outgoing-bubble preview (wa green) |
| app/(dashboard)/settings/whatsapp-account/page.tsx | 39 | whatsapp | WhatsApp-specific status/brand colors (connected, quality GREEN, WhatsApp icon) |
| components/templates/TemplatePreview.tsx | 3 | whatsapp | WhatsApp location-message mock preview |
| components/whatsapp/ConnectWhatsAppModal.tsx | 13 | whatsapp | WhatsApp-specific status/brand colors (connected, quality GREEN, WhatsApp icon) |
| components/WhatsAppGate.tsx | 2 | whatsapp | WhatsApp-specific status/brand colors (connected, quality GREEN, WhatsApp icon) |

## Hex literals (#22c55e #16a34a #15803d #4ade80 #86efac #bbf7d0 #dcfce7 #f0fdf4 #166534 #14532d)

| File | Class | Treatment |
|---|---|---|
| app/globals.css | KEEP | the default --color-brand / --color-brand-dark definitions (overridden by the brand injection) |
| components/analytics/ConversationChart.tsx | ACCENT | inbound bar (primary series) -> useBrandChartColors; outbound #86efac is the paired lighter shade -> primarySoft |
| components/analytics/ConversationsTab.tsx | MIXED | inbound line (primary series) -> brand; 'resolved' #22c55e is a semantic status color, kept |
| components/flows/FlowEditor.tsx | ACCENT | flow edges #16a34a -> brand dark |
| components/flows/utils/serialize.ts | ACCENT | default edge stroke #16a34a -> brand dark (passed in) |
| components/flows/nodes/ActionNode.tsx | KEEP | node-type color map (per action type), not a brand accent |
| app/(dashboard)/settings/contact-settings/tabs/StatusSlideOver.tsx | KEEP | user-pickable status color swatches (data, not theme) |
| components/settings/api-usage/UsageChart.tsx | KEEP | 'success' series is a semantic status color next to red errors |
| components/templates/analytics/TrendChart.tsx | KEEP | 'delivered' series: semantic funnel stage |
| components/trust-score/TrustTrendChart.tsx | KEEP | trust level >= 80 = good: semantic |

Chart/inline-style accents use `useBrandChartColors()` (default brand returns exactly #22c55e / #16a34a / #4ade80; `primarySoft` = #86efac).
