"use client";

import { useState } from "react";
import Link from "next/link";
import type { JSX } from "react";

type BillingCycle = "monthly" | "annual";

const PLANS = [
  {
    name: "Free",
    monthlyPrice: 0 as number | null,
    annualMonthly: 0 as number | null,
    annualTotal: 0 as number | null,
    desc: "Try WBMSG at zero cost",
    agents: "1 agent",
    contacts: "100 contacts",
    popular: false,
    features: [
      "Shared WhatsApp inbox",
      "Basic contact management",
      "2 campaigns per month",
      "Keyword auto-replies",
      "Community support",
    ],
    cta: "Start Free",
    ctaVariant: "outline" as const,
  },
  {
    name: "Starter",
    monthlyPrice: 299 as number | null,
    annualMonthly: 249 as number | null,
    annualTotal: 2990 as number | null,
    desc: "Solo founders & small teams",
    agents: "3 agents",
    contacts: "1,000 contacts",
    popular: false,
    features: [
      "Everything in Free",
      "10 campaigns per month",
      "Visual flow builder",
      "Conversation labels",
      "Canned responses",
      "Email support",
    ],
    cta: "Start 14-Day Trial",
    ctaVariant: "primary" as const,
  },
  {
    name: "Growth",
    monthlyPrice: 599 as number | null,
    annualMonthly: 499 as number | null,
    annualTotal: 5990 as number | null,
    desc: "Growing teams & SMBs",
    agents: "10 agents",
    contacts: "10,000 contacts",
    popular: true,
    features: [
      "Everything in Starter",
      "50 campaigns per month",
      "AI Smart Replies",
      "AI Intent Matching",
      "Deals & pipeline",
      "Advanced analytics",
      "Priority support",
    ],
    cta: "Start 14-Day Trial",
    ctaVariant: "white" as const,
  },
  {
    name: "Scale",
    monthlyPrice: 1999 as number | null,
    annualMonthly: 1666 as number | null,
    annualTotal: 19990 as number | null,
    desc: "Scale-ups & power users",
    agents: "Unlimited agents",
    contacts: "1,00,000 contacts",
    popular: false,
    features: [
      "Everything in Growth",
      "Unlimited campaigns",
      "Webhook integrations",
      "Custom contact fields",
      "Dedicated support",
    ],
    cta: "Start 14-Day Trial",
    ctaVariant: "outline" as const,
  },
];

function formatINR(amount: number): string {
  return amount === 0 ? "₹0" : `₹${amount.toLocaleString("en-IN")}`;
}

export default function PricingSection(): JSX.Element {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <section id="pricing" style={{ padding: "5.5rem 0" }}>
      <style>{`
        .ps-wrap { max-width: 1240px; margin: auto; padding: 0 1.5rem; }

        /* Zero-markup callout */
        .ps-callout {
          background: #DCFCE7; border: 1px solid #16A34A;
          border-left: 4px solid #16A34A;
          border-radius: 12px; padding: 1rem 1.4rem;
          margin-bottom: 2.5rem; max-width: 680px; margin-left: auto; margin-right: auto;
        }
        .ps-callout-title {
          font-size: .82rem; font-weight: 800; color: #15803D;
          text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px;
        }
        .ps-callout-body { font-size: .85rem; color: #166534; line-height: 1.6; }

        /* Toggle */
        .ps-toggle-wrap {
          display: flex; align-items: center; justify-content: center;
          gap: 12px; margin-bottom: 2.5rem;
        }
        .ps-toggle-label { font-size: .85rem; font-weight: 600; color: var(--t2); }
        .ps-toggle-label-active { color: var(--t1); }
        .ps-toggle-btn {
          width: 48px; height: 26px; border-radius: 999px; border: none; cursor: pointer;
          position: relative; transition: background .2s;
        }
        .ps-toggle-btn-off { background: #E5E7EB; }
        .ps-toggle-btn-on { background: var(--g); }
        .ps-toggle-thumb {
          position: absolute; top: 3px; width: 20px; height: 20px;
          border-radius: 50%; background: #fff;
          box-shadow: 0 1px 3px rgba(0,0,0,.2);
          transition: left .2s;
        }
        .ps-toggle-thumb-off { left: 3px; }
        .ps-toggle-thumb-on { left: 25px; }
        .ps-save-badge {
          font-size: .67rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;
          background: var(--g100); color: var(--g7); border: 1px solid var(--g200);
        }

        /* Grid */
        .ps-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }
        @media (max-width: 960px) { .ps-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .ps-grid { grid-template-columns: 1fr; } }

        /* Card */
        .ps-card {
          background: #fff; border: 1px solid var(--bd); border-radius: 14px;
          padding: 1.6rem; display: flex; flex-direction: column;
          box-shadow: var(--sh); transition: box-shadow .2s;
        }
        .ps-card:hover { box-shadow: var(--sh2); }
        .ps-card-pop {
          background: var(--g9); border-color: var(--g9);
          box-shadow: var(--sh3) !important;
        }
        .ps-pop-badge {
          font-size: .62rem; font-weight: 800; letter-spacing: .1em;
          text-transform: uppercase; text-align: center; padding: 5px;
          border-radius: 7px; margin-bottom: 1.2rem;
          background: var(--g); color: #fff;
        }
        .ps-plan-name { font-size: .84rem; font-weight: 700; color: var(--t3); margin-bottom: 5px; }
        .ps-plan-name-pop { color: rgba(255,255,255,.55); }
        .ps-price-row { display: flex; align-items: baseline; gap: 4px; margin-bottom: 2px; }
        .ps-price { font-size: 2.2rem; font-weight: 800; line-height: 1; color: var(--t1); }
        .ps-price-pop { color: #fff; }
        .ps-price-per { font-size: .8rem; color: var(--t3); }
        .ps-price-per-pop { color: rgba(255,255,255,.45); }
        .ps-annual-note { font-size: .7rem; color: var(--t3); margin-bottom: 4px; min-height: 1rem; }
        .ps-annual-note-pop { color: rgba(255,255,255,.38); }
        .ps-desc { font-size: .76rem; color: var(--t3); margin-bottom: 1.1rem; }
        .ps-desc-pop { color: rgba(255,255,255,.4); }
        .ps-divider { border: none; border-top: 1px solid var(--bd); margin: .9rem 0; }
        .ps-divider-pop { border-top-color: rgba(255,255,255,.1); }
        .ps-limits { display: flex; gap: 1rem; margin-bottom: 1rem; }
        .ps-limit-v { font-size: .79rem; font-weight: 700; color: var(--t1); }
        .ps-limit-v-pop { color: #fff; }
        .ps-limit-l { font-size: .67rem; color: var(--t3); }
        .ps-limit-l-pop { color: rgba(255,255,255,.38); }
        .ps-limit-sep { border-left: 1px solid var(--bd); padding-left: 1rem; }
        .ps-limit-sep-pop { border-left-color: rgba(255,255,255,.1); }
        .ps-features { list-style: none; margin: 0 0 1.4rem; padding: 0; display: flex; flex-direction: column; gap: 9px; flex: 1; }
        .ps-feature { display: flex; gap: 9px; font-size: .8rem; color: var(--t2); align-items: flex-start; }
        .ps-feature-pop { color: rgba(255,255,255,.68); }
        .ps-chk { color: var(--g); flex-shrink: 0; margin-top: 1px; }
        .ps-chk-pop { color: #6EE7B7; }
        .ps-cta {
          display: block; text-align: center; padding: 11px;
          border-radius: 9px; font-weight: 700; font-size: .88rem;
          text-decoration: none; transition: all .18s; margin-top: auto;
        }
        .ps-cta-primary { background: var(--g); color: #fff; }
        .ps-cta-primary:hover { background: var(--g7); box-shadow: 0 4px 16px rgba(11,191,119,.35); }
        .ps-cta-white { background: #fff; color: var(--g9); }
        .ps-cta-white:hover { background: #F0FBF6; }
        .ps-cta-outline { border: 1.5px solid var(--bd); color: var(--t2); }
        .ps-cta-outline:hover { border-color: var(--g); color: var(--t1); }

        /* Note */
        .ps-note { text-align: center; font-size: .76rem; color: var(--t3); margin-top: 1.5rem; line-height: 1.7; }
        .ps-note a { color: var(--g7); text-decoration: underline; }
      `}</style>

      <div className="ps-wrap">
        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 12px", borderRadius: 999, fontSize: ".73rem",
            fontWeight: 700, background: "var(--g100)", color: "var(--g7)",
            border: "1px solid var(--g200)", marginBottom: "1rem",
          }}>Transparent Pricing · No Hidden Fees</div>
          <h2 style={{
            fontFamily: "var(--font-br)", fontSize: "clamp(1.8rem,3.5vw,2.8rem)",
            fontWeight: 800, lineHeight: 1.1, letterSpacing: "-.022em",
            color: "var(--t1)", marginBottom: ".9rem",
          }}>Simple, honest pricing</h2>
          <p style={{ fontSize: "1.02rem", color: "var(--t2)", lineHeight: 1.7, maxWidth: 480, margin: "0 auto" }}>
            One flat subscription. Message costs go directly to Meta at their base rates.
          </p>
        </div>

        {/* Zero-markup callout */}
        <div className="ps-callout">
          <div className="ps-callout-title">✓ Meta Tech Provider — Zero Message Markup</div>
          <div className="ps-callout-body">
            Your WhatsApp Business Account stays yours. Message costs are billed directly by Meta at published base rates — we never add a per-message fee. Some platforms add a markup; we don&apos;t.
          </div>
        </div>

        {/* Billing toggle */}
        <div className="ps-toggle-wrap">
          <span className={`ps-toggle-label ${cycle === "monthly" ? "ps-toggle-label-active" : ""}`}>Monthly</span>
          <button
            className={`ps-toggle-btn ${cycle === "annual" ? "ps-toggle-btn-on" : "ps-toggle-btn-off"}`}
            onClick={() => setCycle(c => c === "monthly" ? "annual" : "monthly")}
            aria-label="Toggle billing cycle"
            type="button"
          >
            <span className={`ps-toggle-thumb ${cycle === "annual" ? "ps-toggle-thumb-on" : "ps-toggle-thumb-off"}`} />
          </button>
          <span className={`ps-toggle-label ${cycle === "annual" ? "ps-toggle-label-active" : ""}`}>Annual</span>
          {cycle === "annual" && <span className="ps-save-badge">2 months free</span>}
        </div>

        {/* Plan cards */}
        <div className="ps-grid">
          {PLANS.map((plan) => {
            const dk = plan.popular;
            const price = cycle === "annual" ? plan.annualMonthly : plan.monthlyPrice;
            const annualNote = cycle === "annual" && plan.annualTotal !== null
              ? `Billed ${formatINR(plan.annualTotal)}/year`
              : null;

            return (
              <div key={plan.name} className={`ps-card ${dk ? "ps-card-pop" : ""}`}>
                {dk && <div className="ps-pop-badge">Most Popular</div>}

                <div className={`ps-plan-name ${dk ? "ps-plan-name-pop" : ""}`}>{plan.name}</div>

                <div className="ps-price-row">
                  <span className={`ps-price ${dk ? "ps-price-pop" : ""}`}>
                    {price === 0 ? "₹0" : `₹${(price ?? 0).toLocaleString("en-IN")}`}
                  </span>
                  <span className={`ps-price-per ${dk ? "ps-price-per-pop" : ""}`}>/mo</span>
                </div>

                <div className={`ps-annual-note ${dk ? "ps-annual-note-pop" : ""}`}>
                  {annualNote ?? " "}
                </div>

                <div className={`ps-desc ${dk ? "ps-desc-pop" : ""}`}>{plan.desc}</div>

                <hr className={`ps-divider ${dk ? "ps-divider-pop" : ""}`} />

                <div className="ps-limits">
                  <div>
                    <div className={`ps-limit-v ${dk ? "ps-limit-v-pop" : ""}`}>{plan.agents}</div>
                    <div className={`ps-limit-l ${dk ? "ps-limit-l-pop" : ""}`}>Seats</div>
                  </div>
                  <div className={`ps-limit-sep ${dk ? "ps-limit-sep-pop" : ""}`}>
                    <div className={`ps-limit-v ${dk ? "ps-limit-v-pop" : ""}`}>{plan.contacts}</div>
                    <div className={`ps-limit-l ${dk ? "ps-limit-l-pop" : ""}`}>Contacts</div>
                  </div>
                </div>

                <ul className="ps-features">
                  {plan.features.map((f) => (
                    <li key={f} className={`ps-feature ${dk ? "ps-feature-pop" : ""}`}>
                      <svg className={`ps-chk ${dk ? "ps-chk-pop" : ""}`} width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/sign-up"
                  className={`ps-cta ${
                    dk ? "ps-cta-white" :
                    plan.ctaVariant === "primary" ? "ps-cta-primary" :
                    "ps-cta-outline"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>

        <p className="ps-note">
          All paid plans include a 14-day free trial · No credit card required · Cancel anytime<br />
          Message costs billed directly by Meta at base rates.{" "}
          India marketing rate: ₹0.86 / message.{" "}
          <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener noreferrer">
            See Meta&apos;s full rate sheet →
          </a>
        </p>
      </div>
    </section>
  );
}
