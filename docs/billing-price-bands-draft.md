# Draft: monthly message bands (for the owner to edit)

Status: DRAFT, 2026-10-10. Not implemented. Prices are INR first, then USD.
Model (owner decisions): only messages are billable; every outbound message counts; customers see ONE monthly bill with a band and a cap; Meta bills the customer directly and WBMSG adds no markup on Meta's charges.

## Draft bands

| Band | Messages per month | Monthly bill (INR) | Monthly bill (USD) | Effective rate at the top of the band |
|------|--------------------|--------------------|--------------------|----------------------------------------|
| Free | up to 1,000 | ₹0 | $0 | free |
| 1 | 1,001 to 10,000 | ₹999 | $12 | about ₹0.10 per message |
| 2 | 10,001 to 50,000 | ₹2,999 | $36 | about ₹0.06 per message |
| 3 | 50,001 to 250,000 | ₹7,999 | $96 | about ₹0.03 per message |
| Above | over 250,000 | custom quote | custom quote | decide: hard cap at ₹7,999 or custom |

Why these numbers: they reuse the three price points already configured for the old plans (₹999 / ₹2,999 / ₹7,999 and $12 / $36 / $96), so no new Stripe prices are needed and the change is only in how the band is chosen (message volume instead of a plan name). Today there are 14 customer organizations, all on Starter, with almost no sent messages, so nothing here is derived from real volume yet.

## What competitors charge (public pages and comparison sites, 2026; not verified against their own pricing pages)

| Provider | Monthly platform fee | Marketing message to an Indian number |
|----------|----------------------|----------------------------------------|
| Meta's own rate (India, from 1 Jan 2026) | none | ₹0.8631 (₹1.0185 with 18% GST); utility and authentication about ₹0.115; service messages free |
| AiSensy | about ₹1,500 (Basic) | about ₹1.09, roughly 26% above Meta |
| WATI | about $59 (Growth) | about ₹1.04, roughly 20% above Meta |
| Interakt | about $55 (Growth) | about ₹0.87, close to Meta's rate |

Sources: [Meta India rates summary (myoperator)](https://myoperator.com/blog/whatsapp-business-api-pricing-india-2026), [provider comparison (fast2sms)](https://www.fast2sms.com/help/?p=16722), [whautomate India rates](https://whautomate.com/whatsapp-business-api-pricing-india).

Rough comparison for a customer sending 10,000 marketing messages a month (their own Meta charges not included):
- AiSensy: about ₹1,500 fee plus about ₹2,270 markup, so roughly ₹3,800.
- WATI: about $59 fee plus about ₹1,800 markup.
- WBMSG (this draft, Band 1): ₹999, and no markup on Meta.

## Things the owner should decide or reconsider

1. **Cost per message to WBMSG is unknown.** I used no cost figure. Please share your approximate hosting and queue cost per message so the bands can be checked for margin.
2. **The cap.** A hard cap at ₹7,999 is simple but means a 5-million-message customer pays the same as a 250,000-message one. A custom quote above 250,000 protects margin.
3. **Agent replies are billable (decision B), but Meta gives most of them away free.** Replies inside the 24-hour service window are free service messages at Meta, and competitors do not charge a per-message markup on them. A support-heavy customer who sends 20,000 chat replies and no campaigns would pay Band 2 (₹2,999) here, where the competitors above would charge only their flat fee. This may be the hardest thing to explain to customers. Alternatives: count only template messages and API sends, or count chat replies at a lower weight. Meta's own treatment of service messages is also changing in October 2026, and I could not confirm the India specifics.
4. **Utility and authentication messages.** Meta charges about ₹0.115 for these. A fee of up to ₹0.10 on top of that nearly doubles the cost for customers who mostly send OTPs and order updates. A lower weight or a separate band for them could help.
5. **Free allowance.** 1,000 a month is a guess. With today's customers sending almost nothing, a larger free band could win customers earlier.

## What this draft is not
It is not a price list I recommend publishing. It is a starting point built from your existing price points and the market snapshot above.
