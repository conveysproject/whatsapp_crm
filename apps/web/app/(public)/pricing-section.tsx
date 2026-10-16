"use client";

import { useState } from "react";
import Link from "next/link";
import type { JSX } from "react";
import { pricingCards, freeAllowanceLabel, type Currency, type PublicPricing } from "@/lib/public-pricing";

// Included on every account: there are no plans, seats or feature tiers. Only messages are billed.
const INCLUDED = [
  "Unlimited team members",
  "Unlimited contacts",
  "Shared team inbox",
  "Campaigns & broadcasts",
  "Flows & chatbots",
  "AI replies",
  "API access",
  "Support replies are never counted",
];

export default function PricingSection({ pricing }: { pricing: PublicPricing | null }): JSX.Element {
  const [currency, setCurrency] = useState<Currency>("inr");
  const cards = pricing ? pricingCards(pricing, currency) : [];
  const freeLabel = freeAllowanceLabel(pricing?.freeAllowance ?? 500);

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

        /* Currency toggle */
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
        .ps-plan-name { font-size: .84rem; font-weight: 700; color: var(--t3); margin-bottom: 8px; }
        .ps-plan-name-pop { color: rgba(255,255,255,.55); }
        .ps-price { font-size: 2.2rem; font-weight: 800; line-height: 1; color: var(--t1); margin-bottom: 6px; }
        .ps-price-pop { color: #fff; }
        .ps-price-per { font-size: .8rem; color: var(--t3); margin-bottom: 1.4rem; }
        .ps-price-per-pop { color: rgba(255,255,255,.45); }
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

        /* Fallback while prices are not published */
        .ps-fallback { max-width: 420px; margin: 0 auto; text-align: center; }

        /* Included on every account */
        .ps-included {
          margin-top: 2rem; background: #fff; border: 1px solid var(--bd); border-radius: 14px;
          padding: 1.4rem 1.6rem; box-shadow: var(--sh);
        }
        .ps-included-title { font-size: .8rem; font-weight: 800; color: var(--t1); margin-bottom: .9rem; text-align: center; }
        .ps-features {
          list-style: none; margin: 0; padding: 0;
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px 1rem;
        }
        @media (max-width: 960px) { .ps-features { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 600px) { .ps-features { grid-template-columns: 1fr; } }
        .ps-feature { display: flex; gap: 9px; font-size: .8rem; color: var(--t2); align-items: flex-start; }
        .ps-chk { color: var(--g); flex-shrink: 0; margin-top: 1px; }

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
          }}>Pay only for the messages you send</h2>
          <p style={{ fontSize: "1.02rem", color: "var(--t2)", lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
            No plans, no seats, no feature tiers. {freeLabel}, then one monthly bill by volume, with a cap.
          </p>
        </div>

        {/* Zero-markup callout */}
        <div className="ps-callout">
          <div className="ps-callout-title">✓ Meta Tech Provider — Zero Message Markup</div>
          <div className="ps-callout-body">
            Your WhatsApp Business Account stays yours. Meta bills its own message charges to you directly at its published rates, and we add nothing on top. We only count messages Meta charges for.
          </div>
        </div>

        {cards.length > 0 ? (
          <>
            {/* Currency toggle */}
            <div className="ps-toggle-wrap">
              <span className={`ps-toggle-label ${currency === "inr" ? "ps-toggle-label-active" : ""}`}>INR ₹</span>
              <button
                className={`ps-toggle-btn ${currency === "usd" ? "ps-toggle-btn-on" : "ps-toggle-btn-off"}`}
                onClick={() => setCurrency((c) => (c === "inr" ? "usd" : "inr"))}
                aria-label="Switch currency between INR and USD"
                type="button"
              >
                <span className={`ps-toggle-thumb ${currency === "usd" ? "ps-toggle-thumb-on" : "ps-toggle-thumb-off"}`} />
              </button>
              <span className={`ps-toggle-label ${currency === "usd" ? "ps-toggle-label-active" : ""}`}>USD $</span>
            </div>

            {/* Band cards */}
            <div className="ps-grid">
              {cards.map((card, i) => {
                const dk = card.isCap;
                return (
                  <div key={card.key} className={`ps-card ${dk ? "ps-card-pop" : ""}`}>
                    {dk && <div className="ps-pop-badge">Price cap</div>}
                    <div className={`ps-plan-name ${dk ? "ps-plan-name-pop" : ""}`}>{card.range}</div>
                    <div className={`ps-price ${dk ? "ps-price-pop" : ""}`}>{card.price}</div>
                    <div className={`ps-price-per ${dk ? "ps-price-per-pop" : ""}`}>{card.note}</div>
                    <Link
                      href="/sign-up"
                      className={`ps-cta ${dk ? "ps-cta-white" : i === 0 ? "ps-cta-primary" : "ps-cta-outline"}`}
                    >
                      {i === 0 ? "Start Free" : "Get Started"}
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="ps-card ps-fallback">
            <div className="ps-plan-name">Start free</div>
            <div className="ps-price">{freeLabel}</div>
            <div className="ps-price-per">Then one monthly bill by volume, with a cap.</div>
            <Link href="/sign-up" className="ps-cta ps-cta-primary" style={{ marginBottom: 10 }}>Start Free</Link>
            <Link href="/contact" className="ps-cta ps-cta-outline">Talk to us about pricing</Link>
          </div>
        )}

        {/* Included on every account */}
        <div className="ps-included">
          <div className="ps-included-title">Every account includes</div>
          <ul className="ps-features">
            {INCLUDED.map((f) => (
              <li key={f} className="ps-feature">
                <svg className="ps-chk" width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <p className="ps-note">
          No credit card required · Usage alerts before you move to a new band · Billed monthly after use<br />
          Meta&apos;s own message charges are billed by Meta directly at its base rates.{" "}
          <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener noreferrer">
            See Meta&apos;s full rate sheet →
          </a>
        </p>
      </div>
    </section>
  );
}
