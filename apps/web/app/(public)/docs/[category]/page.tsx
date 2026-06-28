import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import type { Metadata } from "next";
import { registry } from "../../../../lib/docs/registry";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams(): Promise<{ category: string }[]> {
  return registry.map((cat) => ({ category: cat.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const cat = registry.find((c) => c.slug === category);
  if (!cat) return {};
  return {
    title: `${cat.title} — WBMSG Help Center`,
    description: cat.description,
  };
}

export default async function CategoryPage({ params }: Props): Promise<JSX.Element> {
  const { category } = await params;
  const cat = registry.find((c) => c.slug === category);
  if (!cat) notFound();

  return (
    <div className="dcp">
      <style>{`
        .dcp-bc { display: flex; align-items: center; gap: 6px; font-size: .78rem; color: var(--t3); margin-bottom: 1.5rem; }
        .dcp-bc a { color: var(--t3); text-decoration: none; transition: color .15s; }
        .dcp-bc a:hover { color: var(--g7); }
        .dcp-bc-sep { color: var(--bd); }

        .dcp-hero {
          display: flex; align-items: flex-start; gap: 1rem;
          padding-bottom: 1.75rem; border-bottom: 1px solid var(--bd);
          margin-bottom: 2rem;
        }
        .dcp-ic {
          width: 56px; height: 56px; border-radius: 14px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; font-size: 1.6rem;
        }
        .dcp-h1 { font-size: 1.75rem; font-weight: 800; color: var(--t1); margin-bottom: .4rem; }
        .dcp-desc { font-size: .9rem; color: var(--t3); line-height: 1.6; }
        .dcp-count { font-size: .75rem; color: var(--t3); margin-top: .5rem; }

        .dcp-grid { display: flex; flex-direction: column; gap: .75rem; }
        .dcp-art {
          display: flex; align-items: center; justify-content: space-between;
          padding: 1.1rem 1.25rem; border: 1px solid var(--bd); border-radius: 10px;
          text-decoration: none; background: #fff;
          transition: border-color .18s, box-shadow .18s, transform .18s;
        }
        .dcp-art:hover {
          border-color: var(--g200);
          box-shadow: 0 2px 12px rgba(0,20,10,.07);
          transform: translateX(3px);
        }
        .dcp-art-left { flex: 1; }
        .dcp-art-title { font-size: .92rem; font-weight: 600; color: var(--t1); margin-bottom: .25rem; }
        .dcp-art-desc { font-size: .8rem; color: var(--t3); line-height: 1.5; }
        .dcp-art-arrow { color: var(--t3); flex-shrink: 0; margin-left: 1rem; }
      `}</style>

      {/* Breadcrumb */}
      <nav className="dcp-bc">
        <Link href="/docs">Help Center</Link>
        <span className="dcp-bc-sep">›</span>
        <span>{cat.title}</span>
      </nav>

      {/* Hero */}
      <div className="dcp-hero">
        <div className="dcp-ic" style={{ background: cat.bgHex }}>{cat.icon}</div>
        <div>
          <h1 className="dcp-h1">{cat.title}</h1>
          <p className="dcp-desc">{cat.description}</p>
          <p className="dcp-count">{cat.articles.length} articles</p>
        </div>
      </div>

      {/* Article list */}
      <div className="dcp-grid">
        {cat.articles.map((art) => (
          <Link key={art.slug} href={`/docs/${cat.slug}/${art.slug}`} className="dcp-art">
            <div className="dcp-art-left">
              <div className="dcp-art-title">{art.title}</div>
              <div className="dcp-art-desc">{art.description}</div>
            </div>
            <svg className="dcp-art-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 18 6-6-6-6"/>
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}
