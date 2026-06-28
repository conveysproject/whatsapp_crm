import Link from "next/link";
import type { JSX } from "react";
import type { Metadata } from "next";
import { registry } from "../../../lib/docs/registry";

export const metadata: Metadata = {
  title: "Help Center — WBMSG",
  description: "Learn how to set up and use WBMSG — your WhatsApp CRM. Guides for inbox, contacts, campaigns, automation, analytics, and more.",
};

export default function DocsHomePage(): JSX.Element {
  const totalArticles = registry.reduce((sum, cat) => sum + cat.articles.length, 0);

  return (
    <div className="dhp">
      <style>{`
        .dhp-hero {
          text-align: center; padding: 3rem 0 2.5rem;
          border-bottom: 1px solid var(--bd); margin-bottom: 2.5rem;
        }
        .dhp-badge {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: .72rem; font-weight: 700; letter-spacing: .04em;
          text-transform: uppercase; padding: 4px 12px; border-radius: 999px;
          background: var(--g100); color: var(--g7); border: 1px solid var(--g200);
          margin-bottom: 1rem;
        }
        .dhp-h1 {
          font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 800;
          line-height: 1.1; letter-spacing: -.02em; color: var(--t1);
          margin-bottom: .75rem;
        }
        .dhp-sub {
          font-size: 1rem; color: var(--t3); max-width: 480px; margin: 0 auto 1.75rem;
          line-height: 1.6;
        }
        .dhp-stat {
          font-size: .8rem; color: var(--t3);
        }
        .dhp-stat strong { color: var(--t2); font-weight: 600; }

        .dhp-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 1rem;
        }
        .dhp-card {
          display: block; text-decoration: none;
          border: 1px solid var(--bd); border-radius: 12px; padding: 1.4rem;
          transition: border-color .18s, box-shadow .18s, transform .18s;
          background: #fff;
        }
        .dhp-card:hover {
          border-color: var(--g200);
          box-shadow: 0 4px 20px rgba(0,20,10,.08);
          transform: translateY(-2px);
        }
        .dhp-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: .9rem; }
        .dhp-card-ic {
          width: 42px; height: 42px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          font-size: 1.25rem; flex-shrink: 0;
        }
        .dhp-card-title { font-size: .95rem; font-weight: 700; color: var(--t1); }
        .dhp-card-desc { font-size: .8rem; color: var(--t3); line-height: 1.55; margin-bottom: 1rem; }
        .dhp-card-arts {
          list-style: none; display: flex; flex-direction: column; gap: 4px;
        }
        .dhp-card-art {
          font-size: .78rem; color: var(--t2); display: flex; align-items: center; gap: 6px;
        }
        .dhp-card-art::before {
          content: ''; width: 4px; height: 4px; border-radius: 50%;
          background: var(--bd); flex-shrink: 0;
        }
        .dhp-card-more { font-size: .75rem; color: var(--t3); margin-top: 5px; }
      `}</style>

      {/* Hero */}
      <div className="dhp-hero">
        <div className="dhp-badge">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
          Help Center
        </div>
        <h1 className="dhp-h1">How can we help you?</h1>
        <p className="dhp-sub">
          Everything you need to set up and get the most out of WBMSG — from connecting WhatsApp to running AI-powered campaigns.
        </p>
        <p className="dhp-stat">
          <strong>{registry.length} categories</strong> · <strong>{totalArticles} articles</strong>
        </p>
      </div>

      {/* Category grid */}
      <div className="dhp-grid">
        {registry.map((cat) => (
          <Link key={cat.slug} href={`/docs/${cat.slug}`} className="dhp-card">
            <div className="dhp-card-head">
              <div className="dhp-card-ic" style={{ background: cat.bgHex }}>
                {cat.icon}
              </div>
              <div className="dhp-card-title">{cat.title}</div>
            </div>
            <p className="dhp-card-desc">{cat.description}</p>
            <ul className="dhp-card-arts">
              {cat.articles.slice(0, 4).map((art) => (
                <li key={art.slug} className="dhp-card-art">{art.title}</li>
              ))}
            </ul>
            {cat.articles.length > 4 && (
              <p className="dhp-card-more">+{cat.articles.length - 4} more articles</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
