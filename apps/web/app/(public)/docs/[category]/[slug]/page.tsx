import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { JSX } from "react";
import type { Metadata } from "next";
import { registry } from "../../../../../lib/docs/registry";
import { articleSchema, breadcrumbSchema, howToSchema } from "../../../../../lib/docs/structured-data";

const BASE = "https://wbmsg.com";

interface Props {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateStaticParams(): Promise<{ category: string; slug: string }[]> {
  return registry.flatMap((cat) =>
    cat.articles.map((art) => ({ category: cat.slug, slug: art.slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const cat = registry.find((c) => c.slug === category);
  const art = cat?.articles.find((a) => a.slug === slug);
  if (!art) return {};
  return {
    title: `${art.title} — WBMSG Help Center`,
    description: art.description,
    alternates: { canonical: `${BASE}/docs/${category}/${slug}` },
    openGraph: {
      title: `${art.title} — WBMSG Help Center`,
      description: art.description,
      url: `${BASE}/docs/${category}/${slug}`,
      type: "article",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: `${art.title} — WBMSG Help Center` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${art.title} — WBMSG Help Center`,
      description: art.description,
      images: ["/og-image.png"],
    },
  };
}

export default async function ArticlePage({ params }: Props): Promise<JSX.Element> {
  const { category, slug } = await params;
  const cat = registry.find((c) => c.slug === category);
  if (!cat) notFound();
  const artIndex = cat.articles.findIndex((a) => a.slug === slug);
  if (artIndex === -1) notFound();
  const art = cat.articles[artIndex]!;
  const prev = artIndex > 0 ? cat.articles[artIndex - 1] : null;
  const next = artIndex < cat.articles.length - 1 ? cat.articles[artIndex + 1] : null;

  const schemas = [
    articleSchema(art, cat),
    breadcrumbSchema(cat, art),
    howToSchema(art),
  ].filter(Boolean);

  return (
    <article className="dap">
      {schemas.map((s, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(s) }} />
      ))}
      <style>{`
        .dap-bc { display: flex; align-items: center; gap: 6px; font-size: .78rem; color: var(--t3); margin-bottom: 1.5rem; flex-wrap: wrap; }
        .dap-bc a { color: var(--t3); text-decoration: none; transition: color .15s; }
        .dap-bc a:hover { color: var(--g7); }
        .dap-bc-sep { color: var(--bd); }

        .dap-header { margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--bd); }
        .dap-cat-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: .72rem; font-weight: 700; padding: 3px 10px; border-radius: 999px;
          margin-bottom: .75rem;
        }
        .dap-h1 { font-size: 1.9rem; font-weight: 800; line-height: 1.15; letter-spacing: -.02em; color: var(--t1); margin-bottom: .6rem; }
        .dap-desc { font-size: .95rem; color: var(--t3); line-height: 1.65; }

        .dap-body { max-width: 720px; }

        .dap-section { margin-bottom: 2.25rem; }
        .dap-section-h { font-size: 1.15rem; font-weight: 700; color: var(--t1); margin-bottom: .9rem; padding-bottom: .5rem; border-bottom: 1px solid var(--bd); }
        .dap-p { font-size: .9rem; color: var(--t2); line-height: 1.75; margin-bottom: .75rem; }
        .dap-p:last-child { margin-bottom: 0; }

        .dap-steps { counter-reset: step; list-style: none; display: flex; flex-direction: column; gap: .75rem; margin-top: .5rem; }
        .dap-step {
          counter-increment: step;
          display: flex; gap: 12px; align-items: flex-start;
          padding: .9rem 1rem; background: var(--g50);
          border: 1px solid var(--g100); border-radius: 9px;
        }
        .dap-step-num {
          width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
          background: var(--g); color: #fff; font-size: .72rem; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
        }
        .dap-step-num::before { content: counter(step); }
        .dap-step-text { font-size: .875rem; color: var(--t2); line-height: 1.6; }

        .dap-tip {
          display: flex; gap: 10px; padding: .9rem 1rem;
          background: #ECFDF5; border: 1px solid #A7F3D0;
          border-radius: 9px; margin-top: .75rem;
        }
        .dap-tip-ic { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
        .dap-tip-text { font-size: .84rem; color: #065F46; line-height: 1.6; }

        .dap-warning {
          display: flex; gap: 10px; padding: .9rem 1rem;
          background: #FFFBEB; border: 1px solid #FDE68A;
          border-radius: 9px; margin-top: .75rem;
        }
        .dap-warning-ic { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
        .dap-warning-text { font-size: .84rem; color: #92400E; line-height: 1.6; }

        .dap-note {
          display: flex; gap: 10px; padding: .9rem 1rem;
          background: #EFF6FF; border: 1px solid #BFDBFE;
          border-radius: 9px; margin-top: .75rem;
        }
        .dap-note-ic { font-size: 1rem; flex-shrink: 0; margin-top: 1px; }
        .dap-note-text { font-size: .84rem; color: #1E40AF; line-height: 1.6; }

        .dap-img-wrap { margin-top: 1.25rem; border-radius: 10px; overflow: hidden; border: 1px solid var(--bd); box-shadow: 0 2px 12px rgba(0,20,10,.06); }
        .dap-img-wrap img { width: 100%; height: auto; display: block; }
        .dap-img-caption { font-size: .76rem; color: var(--t3); text-align: center; padding: .5rem .75rem; background: var(--g50); border-top: 1px solid var(--bd); }

        .dap-nav {
          display: flex; gap: 1rem; margin-top: 3rem; padding-top: 2rem;
          border-top: 1px solid var(--bd);
        }
        .dap-nav-link {
          flex: 1; display: flex; flex-direction: column; gap: 3px;
          text-decoration: none; padding: 1rem; border: 1px solid var(--bd);
          border-radius: 9px; transition: border-color .15s, box-shadow .15s;
        }
        .dap-nav-link:hover { border-color: var(--g200); box-shadow: 0 2px 12px rgba(0,20,10,.07); }
        .dap-nav-dir { font-size: .72rem; font-weight: 600; color: var(--t3); }
        .dap-nav-title { font-size: .85rem; font-weight: 600; color: var(--t1); }
        .dap-nav-right { text-align: right; }
        .dap-nav-spacer { flex: 1; }

        .dap-feedback {
          margin-top: 2.5rem; padding: 1.25rem; background: var(--g50);
          border: 1px solid var(--bd); border-radius: 10px; text-align: center;
        }
        .dap-feedback-q { font-size: .85rem; font-weight: 600; color: var(--t2); margin-bottom: .75rem; }
        .dap-feedback-btns { display: flex; justify-content: center; gap: .75rem; }
        .dap-feedback-btn {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: .8rem; font-weight: 600; padding: 7px 16px;
          border: 1px solid var(--bd); border-radius: 7px;
          background: #fff; color: var(--t2); cursor: pointer;
          transition: all .15s;
        }
        .dap-feedback-btn:hover { border-color: var(--g200); color: var(--t1); }
      `}</style>

      {/* Breadcrumb */}
      <nav className="dap-bc">
        <Link href="/docs">Help Center</Link>
        <span className="dap-bc-sep">›</span>
        <Link href={`/docs/${cat.slug}`}>{cat.title}</Link>
        <span className="dap-bc-sep">›</span>
        <span>{art.title}</span>
      </nav>

      {/* Article header */}
      <div className="dap-header">
        <div
          className="dap-cat-badge"
          style={{ background: cat.bgHex, color: cat.colorHex }}
        >
          {cat.icon} {cat.title}
        </div>
        <h1 className="dap-h1">{art.title}</h1>
        <p className="dap-desc">{art.description}</p>
      </div>

      {/* Article body */}
      <div className="dap-body">
        {art.sections.map((sec, i) => (
          <div key={i} className="dap-section">
            {sec.heading && <h2 className="dap-section-h">{sec.heading}</h2>}

            {sec.paragraphs?.map((p, j) => (
              <p key={j} className="dap-p">{p}</p>
            ))}

            {sec.steps && sec.steps.length > 0 && (
              <ol className="dap-steps">
                {sec.steps.map((step, j) => (
                  <li key={j} className="dap-step">
                    <div className="dap-step-num" />
                    <span className="dap-step-text">{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {sec.image && (
              <div className="dap-img-wrap">
                <Image
                  src={sec.image.src}
                  alt={sec.image.alt}
                  width={1440}
                  height={900}
                  style={{ width: "100%", height: "auto" }}
                  unoptimized
                />
                {sec.image.caption && (
                  <div className="dap-img-caption">{sec.image.caption}</div>
                )}
              </div>
            )}

            {sec.tip && (
              <div className="dap-tip">
                <span className="dap-tip-ic">💡</span>
                <span className="dap-tip-text">{sec.tip}</span>
              </div>
            )}

            {sec.warning && (
              <div className="dap-warning">
                <span className="dap-warning-ic">⚠️</span>
                <span className="dap-warning-text">{sec.warning}</span>
              </div>
            )}

            {sec.note && (
              <div className="dap-note">
                <span className="dap-note-ic">ℹ️</span>
                <span className="dap-note-text">{sec.note}</span>
              </div>
            )}
          </div>
        ))}

        {/* Prev / Next navigation */}
        <div className="dap-nav">
          {prev ? (
            <Link href={`/docs/${cat.slug}/${prev.slug}`} className="dap-nav-link">
              <span className="dap-nav-dir">← Previous</span>
              <span className="dap-nav-title">{prev.title}</span>
            </Link>
          ) : (
            <div className="dap-nav-spacer" />
          )}
          {next ? (
            <Link href={`/docs/${cat.slug}/${next.slug}`} className="dap-nav-link dap-nav-right">
              <span className="dap-nav-dir">Next →</span>
              <span className="dap-nav-title">{next.title}</span>
            </Link>
          ) : (
            <div className="dap-nav-spacer" />
          )}
        </div>

        {/* Feedback */}
        <div className="dap-feedback">
          <p className="dap-feedback-q">Was this article helpful?</p>
          <div className="dap-feedback-btns">
            <button className="dap-feedback-btn">👍 Yes, helpful</button>
            <button className="dap-feedback-btn">👎 Needs improvement</button>
          </div>
        </div>
      </div>
    </article>
  );
}
