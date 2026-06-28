import Link from "next/link";
import Image from "next/image";
import type { ReactNode, JSX } from "react";
import type { Metadata } from "next";
import { registry } from "../../../lib/docs/registry";

export const metadata: Metadata = {
  metadataBase: new URL("https://wbmsg.com"),
};

export default function DocsLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="dl-root">
      <style>{`
        :root {
          --g: #0BBF77; --g7: #089058; --g9: #08452E;
          --g50: #F0FBF6; --g100: #D9F5EB; --g200: #B0E8D0;
          --t1: #0C1A10; --t2: #374D3E; --t3: #738A7B;
          --bd: #E0EBE5;
          --sh: 0 1px 4px rgba(0,20,10,.06),0 1px 2px rgba(0,20,10,.04);
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: system-ui, -apple-system, sans-serif; color: var(--t1); background: #fff; }

        .dl-root { min-height: 100vh; display: flex; flex-direction: column; }

        /* HEADER */
        .dh {
          position: sticky; top: 0; z-index: 50; height: 60px;
          background: rgba(255,255,255,.96); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--bd);
          display: flex; align-items: center;
        }
        .dh-in {
          width: 100%; max-width: 1320px; margin: 0 auto; padding: 0 1.5rem;
          display: flex; align-items: center; gap: 1.5rem;
        }
        .dh-logo { display: flex; align-items: center; gap: 8px; text-decoration: none; flex-shrink: 0; }
        .dh-logo-sep { width: 1px; height: 20px; background: var(--bd); }
        .dh-logo-label { font-size: .8rem; font-weight: 600; color: var(--t3); }
        .dh-search {
          flex: 1; max-width: 420px;
          display: flex; align-items: center; gap: 8px;
          border: 1px solid var(--bd); border-radius: 8px;
          padding: 7px 12px; font-size: .875rem; color: var(--t3);
          background: var(--g50); cursor: pointer; transition: border-color .15s;
        }
        .dh-search:hover { border-color: var(--g200); }
        .dh-search svg { flex-shrink: 0; color: var(--t3); }
        .dh-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
        .dh-signin {
          font-size: .8rem; font-weight: 600; color: var(--t2);
          text-decoration: none; padding: 7px 16px;
          border: 1px solid var(--bd); border-radius: 7px;
          transition: all .15s;
        }
        .dh-signin:hover { border-color: var(--g200); color: var(--t1); }
        .dh-cta {
          font-size: .8rem; font-weight: 700; color: #fff;
          background: var(--g); text-decoration: none;
          padding: 8px 16px; border-radius: 7px; transition: background .15s;
        }
        .dh-cta:hover { background: var(--g7); }

        /* BODY */
        .dl-body {
          flex: 1; display: flex;
          max-width: 1320px; width: 100%; margin: 0 auto;
          padding: 0 1.5rem;
        }

        /* SIDEBAR */
        .ds {
          width: 240px; flex-shrink: 0; padding: 2rem 1rem 2rem 0;
          position: sticky; top: 60px; height: calc(100vh - 60px);
          overflow-y: auto;
        }
        .ds-section { margin-bottom: 1.5rem; }
        .ds-label {
          font-size: .67rem; font-weight: 700; letter-spacing: .08em;
          text-transform: uppercase; color: var(--t3);
          padding: 0 8px; margin-bottom: .5rem;
        }
        .ds-cat {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 8px; border-radius: 7px; margin-bottom: 2px;
          font-size: .82rem; font-weight: 600; color: var(--t2);
          text-decoration: none; transition: all .15s;
        }
        .ds-cat:hover { background: var(--g50); color: var(--t1); }
        .ds-cat-ic { font-size: .95rem; }
        .ds-arts { padding-left: 1.6rem; margin-bottom: .5rem; }
        .ds-art {
          display: block; padding: 5px 8px; border-radius: 6px;
          font-size: .8rem; color: var(--t3); text-decoration: none;
          transition: all .15s; margin-bottom: 1px;
        }
        .ds-art:hover { background: var(--g50); color: var(--t1); }
        .ds-art-active { background: var(--g100); color: var(--g7) !important; font-weight: 600; }

        /* MAIN */
        .dm {
          flex: 1; min-width: 0; padding: 2rem 0 2rem 2.5rem;
          border-left: 1px solid var(--bd);
        }

        /* FOOTER */
        .df {
          border-top: 1px solid var(--bd); padding: 1.5rem;
          text-align: center; font-size: .75rem; color: var(--t3);
        }
        .df a { color: var(--g7); text-decoration: none; }
        .df a:hover { text-decoration: underline; }

        @media (max-width: 768px) {
          .ds { display: none; }
          .dm { padding: 1.5rem 0; border-left: none; }
          .dl-body { padding: 0 1rem; }
        }
      `}</style>

      {/* Header */}
      <header className="dh">
        <div className="dh-in">
          <Link href="/" className="dh-logo">
            <Image src="/wbmsg_logo.png" alt="WBMSG" width={120} height={34} style={{ height: "28px", width: "auto" }} />
          </Link>
          <div className="dh-logo-sep" />
          <span className="dh-logo-label">Help Center</span>

          <div className="dh-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            Search articles...
          </div>

          <div className="dh-right">
            <Link href="/sign-in" className="dh-signin">Sign In</Link>
            <Link href="/sign-up" className="dh-cta">Start Free →</Link>
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="dl-body">
        {/* Sidebar */}
        <aside className="ds">
          <div className="ds-section">
            <div className="ds-label">Documentation</div>
            {registry.map((cat) => (
              <div key={cat.slug}>
                <Link href={`/docs/${cat.slug}`} className="ds-cat">
                  <span className="ds-cat-ic">{cat.icon}</span>
                  {cat.title}
                </Link>
                <div className="ds-arts">
                  {cat.articles.map((art) => (
                    <Link
                      key={art.slug}
                      href={`/docs/${cat.slug}/${art.slug}`}
                      className="ds-art"
                    >
                      {art.title}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="dm">{children}</main>
      </div>

      <footer className="df">
        <p>© 2026 WBMSG · <Link href="/docs">Help Center</Link> · <Link href="/sign-up">Start Free</Link></p>
      </footer>
    </div>
  );
}
