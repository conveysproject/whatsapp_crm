"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { PublicNav } from "@/components/public/PublicNav";
import { BusinessFields } from "@/components/auth/BusinessFields";
import { validateBusinessScreen, type BusinessValues, type FieldErrors } from "@/lib/auth/signup-steps";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-br", weight: ["600", "700", "800"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm", weight: ["400", "500"] });


type FormState = BusinessValues;

const INIT: FormState = {
  companyName: "", companyWebsite: "",
  companyLocation: "", industry: "", subCategory: "", revenue: "",
  termsAccepted: false,
};

interface Identity {
  isLoaded: boolean;
  firstName: string | null | undefined;
  lastName: string | null | undefined;
  email: string;
  orgName: string | undefined;
}

// wbmsg: only the email is shown; the API derives the register identity server-side.
function useWbmsgIdentity(): Identity {
  const { data, isError } = useQuery<{ email?: string } | null>({
    queryKey: ["auth-me-security"],
    queryFn: async () => {
      const res = await fetch("/api/v1/auth/me/security");
      return res.ok ? ((await res.json()) as { email?: string }) : null;
    },
  });
  return { isLoaded: data !== undefined || isError, firstName: undefined, lastName: undefined, email: data?.email ?? "", orgName: undefined };
}

type FieldError = FieldErrors<FormState>;

export default function BusinessDetailsPage(): JSX.Element {
  const identity = useWbmsgIdentity();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INIT);
  const [errors, setErrors] = useState<FieldError>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  function validate(): boolean {
    const e = validateBusinessScreen(form);
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setLoading(true);
    setApiError("");
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, companyName: form.companyName.trim() }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        const data = await res.json() as { error?: string };
        setApiError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setApiError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  const fullName = [identity.firstName, identity.lastName].filter(Boolean).join(" ") || (identity.email || "—");
  const email = identity.email;
  const initials = [identity.firstName?.[0], identity.lastName?.[0]].filter(Boolean).join("").toUpperCase() || (identity.email[0]?.toUpperCase() ?? "?");

  if (!identity.isLoaded) {
    return (
      <div className={`${bricolage.variable} ${dmSans.variable}`} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F6FC", fontFamily: "var(--font-dm), sans-serif", color: "#5A7A62" }}>
        Loading your profile…
      </div>
    );
  }

  return (
    <div className={`${bricolage.variable} ${dmSans.variable} bd2`}>
      <style>{`
        .bd2 {
          --g: #0BBF77; --g7: #089058; --g50: #F0FBF6; --g100: #D9F5EB; --g200: #B0E8D0; --g900: #08452E;
          --t1: #0C1A10; --t2: #374D3E; --t3: #738A7B; --bd: #E0EBE5; --err: #DC2626;
          --inp: #F4F6FC;
          min-height: 100vh;
          background: #F4F6FC;
          font-family: var(--font-dm), system-ui, sans-serif;
          color: var(--t1);
        }

        /* PAGE WRAPPER — below fixed nav */
        .bd2-page {
          padding-top: 68px;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding-bottom: 3rem;
          min-height: 100vh;
        }

        /* OUTER CARD — matches sign-up/sign-in exactly */
        .bd2-card {
          width: 100%; max-width: 1000px;
          background: #fff;
          border-radius: 1rem;
          box-shadow: 0 20px 60px rgba(0,20,10,.1), 0 4px 16px rgba(0,20,10,.06);
          display: flex;
          overflow: hidden;
          margin: 2rem 1rem;
        }

        /* LEFT PANEL */
        .bd2-left {
          display: none;
          flex-direction: column;
          justify-content: flex-start;
          background: #F4F6FC;
          padding: 2.5rem 2.5rem;
          width: 42%;
          flex-shrink: 0;
          gap: 1.25rem;
          border-right: 1px solid var(--bd);
        }
        @media (min-width: 768px) { .bd2-left { display: flex; } }

        /* Logo */
        .bd2-logo { display: flex; align-items: center; gap: 9px; text-decoration: none; margin-bottom: .25rem; }
        .bd2-logo-ic { width: 36px; height: 36px; border-radius: 10px; background: var(--g); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .bd2-logo-tx { font-family: var(--font-br); font-weight: 800; font-size: 1.1rem; color: var(--t1); }

        /* Step progress */
        .bd2-steps { display: flex; align-items: center; gap: 6px; }
        .bd2-pip { height: 4px; border-radius: 2px; }
        .bd2-pip-done { background: var(--g); width: 32px; }
        .bd2-pip-active { background: var(--g); width: 32px; }
        .bd2-pip-idle { background: var(--bd); width: 32px; }
        .bd2-step-label { font-size: .72rem; color: var(--t3); font-weight: 500; margin-left: 4px; }

        /* Profile box */
        .bd2-profile {
          background: #fff; border: 1px solid var(--bd); border-radius: 12px;
          padding: 1rem 1.1rem; display: flex; align-items: center; gap: 12px;
        }
        .bd2-avatar {
          width: 44px; height: 44px; border-radius: 50%; background: var(--g);
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-br); font-weight: 800; font-size: 1rem; color: #fff;
          flex-shrink: 0; border: 2px solid var(--g200);
        }
        .bd2-pname { font-family: var(--font-br); font-weight: 700; font-size: .88rem; color: var(--t1); }
        .bd2-pemail { font-size: .72rem; color: var(--t3); margin-top: 1px; }
        .bd2-verified {
          margin-left: auto; display: flex; align-items: center; gap: 4px;
          font-size: .68rem; font-weight: 600; color: var(--g7);
          background: var(--g100); border: 1px solid var(--g200);
          padding: 3px 8px; border-radius: 999px; white-space: nowrap;
        }

        /* Heading + bullets */
        .bd2-heading { font-family: var(--font-br); font-size: 1.35rem; font-weight: 800; color: var(--t1); line-height: 1.2; }
        .bd2-bullets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
        .bd2-bullet { display: flex; align-items: flex-start; gap: 9px; font-size: .82rem; color: var(--t2); line-height: 1.45; }
        .bd2-bullet-dot { width: 18px; height: 18px; border-radius: 50%; background: var(--g100); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }

        /* Trial note */
        .bd2-trial {
          background: var(--g50); border: 1px solid var(--g200); border-radius: 9px;
          padding: .65rem .9rem; font-size: .76rem; color: var(--g7); font-weight: 600;
          display: flex; align-items: center; gap: 6px;
        }

        /* RIGHT PANEL */
        .bd2-right {
          flex: 1;
          padding: 2rem 2rem 2.5rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: .9rem;
        }

        /* Right heading */
        .bd2-right-title { font-family: var(--font-br); font-size: 1.25rem; font-weight: 800; color: var(--t1); }
        .bd2-right-sub { font-size: .82rem; color: var(--t3); margin-top: 2px; }

        /* API error */
        .bd2-api-err {
          background: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px;
          padding: .65rem .9rem; font-size: .79rem; color: var(--err); text-align: center;
        }

        /* Submit */
        .bd2-submit {
          background: var(--g); color: #fff;
          font-family: var(--font-br); font-weight: 700; font-size: .95rem;
          padding: 13px; border-radius: 9px; border: none; cursor: pointer;
          width: 100%; transition: all .18s; display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .bd2-submit:hover:not(:disabled) { background: var(--g7); box-shadow: 0 4px 16px rgba(11,191,119,.35); transform: translateY(-1px); }
        .bd2-submit:disabled { opacity: .6; cursor: not-allowed; transform: none; }

        /* Footer note */
        .bd2-foot-note { font-size: .68rem; color: var(--t3); text-align: center; }
        .bd2-foot-note a { color: var(--g7); text-decoration: underline; }

        /* Spinner */
        @keyframes bd2-spin { to { transform: rotate(360deg); } }
        .bd2-spinner { width: 15px; height: 15px; border: 2px solid rgba(255,255,255,.4); border-top-color: #fff; border-radius: 50%; animation: bd2-spin .6s linear infinite; }
      `}</style>

      <PublicNav active="sign-up" />

      <div className="bd2-page">
        <div className="bd2-card">

          {/* ── LEFT PANEL ── */}
          <div className="bd2-left">
            <Link href="/" className="bd2-logo">
              <Image src="/wbmsg_logo.png" alt="WBMSG" width={200} height={56} style={{ height: "36px", width: "auto" }} priority />
            </Link>

            {/* Step progress */}
            <div className="bd2-steps">
              <div className="bd2-pip bd2-pip-done" />
              <div className="bd2-pip bd2-pip-active" />
              <span className="bd2-step-label">Step 2 of 2</span>
            </div>

            <h2 className="bd2-heading">Almost there —<br />tell us about your business</h2>

            {/* Profile box */}
            <div className="bd2-profile">
              <div className="bd2-avatar">{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="bd2-pname">{fullName}</div>
                <div className="bd2-pemail">{email}</div>
              </div>
              <div className="bd2-verified">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                Verified
              </div>
            </div>

            {/* Bullets */}
            <ul className="bd2-bullets">
              {[
                "Your WhatsApp inbox will be ready in minutes",
                "Invite your team and assign conversations",
                "Connect your Meta Business account next",
                "AI replies and analytics from day one",
              ].map(b => (
                <li key={b} className="bd2-bullet">
                  <div className="bd2-bullet-dot">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="#0BBF77"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" /></svg>
                  </div>
                  {b}
                </li>
              ))}
            </ul>

            {/* Trial note */}
            <div className="bd2-trial">
              🎉 14-day free trial · No credit card required
            </div>
          </div>

          {/* ── RIGHT PANEL (form) ── */}
          <div className="bd2-right">
            <div>
              <div className="bd2-right-title">Business details</div>
              <div className="bd2-right-sub">Help us personalise your experience</div>
            </div>

            <BusinessFields
              values={form}
              errors={errors}
              onChange={patch => { setForm(f => ({ ...f, ...patch })); setErrors(er => { const n = { ...er }; for (const k of Object.keys(patch)) delete n[k as keyof FieldError]; return n; }); }}
            />

            {apiError && <div className="bd2-api-err">{apiError}</div>}

            <button className="bd2-submit" onClick={handleSubmit} disabled={loading}>
              {loading
                ? <><div className="bd2-spinner" /> Setting up your account…</>
                : <>Create Account &rarr;</>}
            </button>

            <div className="bd2-foot-note">
              Stored securely in India · DPDP Act compliant ·{" "}
              <Link href="#">Privacy Policy</Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}