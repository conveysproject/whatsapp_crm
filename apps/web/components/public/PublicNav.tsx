import Link from "next/link";
import Image from "next/image";
import type { JSX } from "react";

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
            <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "36px", width: "auto" }} priority />
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