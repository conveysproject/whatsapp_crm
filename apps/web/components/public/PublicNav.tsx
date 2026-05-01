import Link from "next/link";
import type { JSX } from "react";

const WA_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" fill="white" />
    <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652A11.94 11.94 0 0 0 12.045 24c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.48-8.447z" fill="white" fillOpacity=".25" />
  </svg>
);

const NAV_LINKS = [
  { label: "Features",     href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing",      href: "/#pricing" },
  { label: "For Agencies", href: "/#agency" },
];

interface PublicNavProps {
  /** Which auth page is active — hides the redundant CTA for that page */
  active: "sign-in" | "sign-up";
}

export function PublicNav({ active }: PublicNavProps): JSX.Element {
  return (
    <>
      <style>{`
        .pn {
          --g: #0BBF77; --g7: #089058;
          --t1: #0C1A10; --t2: #374D3E;
          --bd: #E0EBE5;
          position: fixed; inset: 0 0 auto; height: 68px; z-index: 100;
          background: rgba(255,255,255,.95); backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--bd);
          display: flex; align-items: center;
          font-family: system-ui, sans-serif;
        }
        .pn-in {
          max-width: 1240px; width: 100%; margin: auto;
          padding: 0 1.5rem;
          display: flex; align-items: center; justify-content: space-between;
        }
        .pn-logo {
          display: flex; align-items: center; gap: 9px; text-decoration: none;
        }
        .pn-logo-ic {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--g);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .pn-logo-tx {
          font-weight: 800; font-size: 1.1rem; color: var(--t1);
          letter-spacing: -.01em;
        }
        .pn-links {
          display: flex; gap: 2rem;
        }
        .pn-link {
          font-size: .875rem; font-weight: 500; color: var(--t2);
          text-decoration: none; transition: color .15s;
        }
        .pn-link:hover { color: var(--t1); }
        .pn-act { display: flex; align-items: center; gap: 10px; }
        .pn-ghost {
          font-size: .875rem; font-weight: 500; color: var(--t2);
          padding: 9px 18px; text-decoration: none; transition: color .15s;
        }
        .pn-ghost:hover { color: var(--t1); }
        .pn-btn {
          display: inline-flex; align-items: center; gap: 5px;
          background: var(--g); color: #fff;
          font-weight: 700; font-size: .875rem;
          padding: 10px 20px; border-radius: 9px;
          text-decoration: none; transition: all .18s;
        }
        .pn-btn:hover {
          background: var(--g7);
          box-shadow: 0 4px 16px rgba(11,191,119,.35);
          transform: translateY(-1px);
        }
        @media (max-width: 768px) {
          .pn-links { display: none; }
        }
      `}</style>

      <nav className="pn">
        <div className="pn-in">
          <Link href="/" className="pn-logo">
            <div className="pn-logo-ic">{WA_ICON}</div>
            <span className="pn-logo-tx">TrustCRM</span>
          </Link>

          <div className="pn-links">
            {NAV_LINKS.map(({ label, href }) => (
              <a key={href} href={href} className="pn-link">{label}</a>
            ))}
          </div>

          <div className="pn-act">
            {active === "sign-up" && (
              <Link href="/sign-in" className="pn-ghost">Log in</Link>
            )}
            {active === "sign-in" && (
              <Link href="/sign-up" className="pn-btn">Start Free →</Link>
            )}
          </div>
        </div>
      </nav>
    </>
  );
}