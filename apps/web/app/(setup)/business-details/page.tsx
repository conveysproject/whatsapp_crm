"use client";

import { useUser } from "@clerk/nextjs";
import { useState, useEffect, type JSX, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { PublicNav } from "@/components/public/PublicNav";

const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-br", weight: ["600", "700", "800"] });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm", weight: ["400", "500"] });

const COUNTRY_CODES = [
  { code: "+1",   flag: "🇺🇸", name: "US/CA" },
  { code: "+7",   flag: "🇷🇺", name: "RU" },
  { code: "+20",  flag: "🇪🇬", name: "EG" },
  { code: "+27",  flag: "🇿🇦", name: "ZA" },
  { code: "+33",  flag: "🇫🇷", name: "FR" },
  { code: "+34",  flag: "🇪🇸", name: "ES" },
  { code: "+39",  flag: "🇮🇹", name: "IT" },
  { code: "+44",  flag: "🇬🇧", name: "GB" },
  { code: "+49",  flag: "🇩🇪", name: "DE" },
  { code: "+55",  flag: "🇧🇷", name: "BR" },
  { code: "+60",  flag: "🇲🇾", name: "MY" },
  { code: "+61",  flag: "🇦🇺", name: "AU" },
  { code: "+62",  flag: "🇮🇩", name: "ID" },
  { code: "+63",  flag: "🇵🇭", name: "PH" },
  { code: "+65",  flag: "🇸🇬", name: "SG" },
  { code: "+66",  flag: "🇹🇭", name: "TH" },
  { code: "+81",  flag: "🇯🇵", name: "JP" },
  { code: "+82",  flag: "🇰🇷", name: "KR" },
  { code: "+86",  flag: "🇨🇳", name: "CN" },
  { code: "+90",  flag: "🇹🇷", name: "TR" },
  { code: "+91",  flag: "🇮🇳", name: "IN" },
  { code: "+92",  flag: "🇵🇰", name: "PK" },
  { code: "+94",  flag: "🇱🇰", name: "LK" },
  { code: "+95",  flag: "🇲🇲", name: "MM" },
  { code: "+234", flag: "🇳🇬", name: "NG" },
  { code: "+254", flag: "🇰🇪", name: "KE" },
  { code: "+880", flag: "🇧🇩", name: "BD" },
  { code: "+960", flag: "🇲🇻", name: "MV" },
  { code: "+966", flag: "🇸🇦", name: "SA" },
  { code: "+971", flag: "🇦🇪", name: "AE" },
  { code: "+972", flag: "🇮🇱", name: "IL" },
  { code: "+974", flag: "🇶🇦", name: "QA" },
  { code: "+977", flag: "🇳🇵", name: "NP" },
  { code: "+995", flag: "🇬🇪", name: "GE" },
];

const INDUSTRIES = [
  "Marketing & Advertising", "Retail", "Education",
  "Entertainment, Social Media & Gaming", "Finance", "Healthcare",
  "Public Utilities & Non Profits", "Professional Services", "Technology",
  "Travel & Hospitality", "Automotive", "Real Estate & Construction",
  "Restaurants", "Manufacturing & IMPEX", "Fitness & Wellness",
];

const SUB_CATEGORIES: Record<string, string[]> = {
  "Marketing & Advertising": ["Digital Marketing Agency", "PR & Communications", "Brand Agency", "Media Buying", "SEO / SEM"],
  "Retail": ["E-commerce", "Physical Store", "D2C Brand", "Wholesale / B2B", "Franchise"],
  "Education": ["EdTech Platform", "K-12 School", "Higher Education", "Coaching Centre", "Skill Development"],
  "Entertainment, Social Media & Gaming": ["Gaming Studio", "OTT / Streaming", "Social Media App", "Events & Entertainment", "Sports"],
  "Finance": ["Fintech", "Banking / NBFC", "Insurance", "Wealth Management", "Lending"],
  "Healthcare": ["Hospital / Clinic", "Pharmacy", "Health Tech", "Diagnostics Lab", "Telemedicine"],
  "Public Utilities & Non Profits": ["NGO / Foundation", "Government", "Public Utilities", "Religious Organisation"],
  "Professional Services": ["Legal / Law Firm", "Management Consulting", "Accounting / CA", "HR / Staffing", "Architecture / Design"],
  "Technology": ["SaaS Product", "IT Services", "IoT", "AI / ML", "Cybersecurity"],
  "Travel & Hospitality": ["Hotel / Resort", "Travel Agency", "Airlines", "Tourism", "Online Travel Platform"],
  "Automotive": ["Car Dealer", "Auto Parts", "Electric Vehicles", "Auto Service Centre", "Car Rental"],
  "Real Estate & Construction": ["Residential", "Commercial", "Construction", "Interior Design", "PropTech"],
  "Restaurants": ["QSR / Fast Food", "Fine Dining", "Cloud Kitchen", "Café / Bakery", "Catering"],
  "Manufacturing & IMPEX": ["Manufacturing", "Import / Export", "Logistics", "Distribution", "Packaging"],
  "Fitness & Wellness": ["Gym / Fitness Studio", "Yoga / Meditation", "Nutrition & Diet", "Wellness Centre", "Sports Academy"],
};

const REVENUE_BANDS = [
  "Less than ₹5 Lakhs", "₹5 Lakhs – ₹25 Lakhs", "₹25 Lakhs – ₹50 Lakhs",
  "₹50 Lakhs – ₹1 Crore", "₹1 Crore – ₹10 Crore", "₹10 Crore – ₹100 Crore",
  "More than ₹100 Crore",
];

interface FormState {
  countryCode: string; phone: string; companyName: string;
  companyWebsite: string; companyLocation: string; industry: string;
  subCategory: string; revenue: string; whatsappUpdates: boolean; termsAccepted: boolean;
}

const INIT: FormState = {
  countryCode: "+91", phone: "", companyName: "", companyWebsite: "",
  companyLocation: "", industry: "", subCategory: "", revenue: "",
  whatsappUpdates: true, termsAccepted: false,
};

type FieldError = Partial<Record<keyof FormState, string>>;

export default function BusinessDetailsPage(): JSX.Element {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INIT);
  const [errors, setErrors] = useState<FieldError>({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  useEffect(() => {
    if (form.companyWebsite && !form.companyWebsite.startsWith("www.") && !form.companyWebsite.startsWith("http")) {
      setForm(f => ({ ...f, companyWebsite: "www." + f.companyWebsite }));
    }
  }, [form.companyWebsite]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }));
    if (key === "industry") setForm(f => ({ ...f, industry: value as string, subCategory: "" }));
    setErrors(e => ({ ...e, [key]: undefined }));
  }

  function validate(): boolean {
    const e: FieldError = {};
    if (!form.phone.trim() || !/^\d{7,15}$/.test(form.phone.replace(/[\s-]/g, "")))
      e.phone = "Enter a valid WhatsApp number";
    if (!form.companyName.trim())    e.companyName    = "Company name is required";
    if (!form.companyWebsite.trim()) e.companyWebsite = "Company website is required";
    if (!form.companyLocation.trim()) e.companyLocation = "Company location is required";
    if (!form.industry)              e.industry       = "Please select your industry";
    if (!form.subCategory)           e.subCategory    = "Please select a category";
    if (!form.revenue)               e.revenue        = "Please select annual revenue";
    if (!form.termsAccepted)         e.termsAccepted  = "You must accept the terms to continue";
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
        body: JSON.stringify({
          ...form,
          email: user?.primaryEmailAddress?.emailAddress,
          firstName: user?.firstName,
          lastName: user?.lastName,
        }),
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

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "—";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";
  const subCats = form.industry ? (SUB_CATEGORIES[form.industry] ?? []) : [];

  if (!isLoaded) {
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

        /* Section labels */
        .bd2-section {
          font-family: var(--font-br); font-size: .72rem; font-weight: 700;
          text-transform: uppercase; letter-spacing: .07em; color: var(--t3);
        }

        /* Grid rows */
        .bd2-row { display: grid; gap: .65rem; }
        .bd2-row-2 { grid-template-columns: 1fr 1fr; }
        .bd2-row-1 { grid-template-columns: 1fr; }
        @media (max-width: 520px) { .bd2-row-2 { grid-template-columns: 1fr; } }

        /* Fields */
        .bd2-field { display: flex; flex-direction: column; gap: 4px; }
        .bd2-label { font-size: .72rem; font-weight: 600; color: var(--t2); }
        .bd2-inp {
          background: var(--inp); border: 1.5px solid transparent; border-radius: 8px;
          padding: 10px 12px; font-size: .85rem; color: var(--t1);
          font-family: var(--font-dm), sans-serif;
          outline: none; transition: border-color .15s, box-shadow .15s; width: 100%; box-sizing: border-box;
        }
        .bd2-inp:focus { border-color: var(--g); box-shadow: 0 0 0 3px rgba(11,191,119,.12); background: #fff; }
        .bd2-inp::placeholder { color: var(--t3); }
        .bd2-inp-err { border-color: var(--err) !important; }
        .bd2-err { font-size: .68rem; color: var(--err); }

        /* Phone row */
        .bd2-phone-row { display: flex; gap: 7px; }
        .bd2-cc {
          background: var(--inp); border: 1.5px solid transparent; border-radius: 8px;
          padding: 10px 8px; font-size: .8rem; color: var(--t1);
          font-family: var(--font-dm), sans-serif; outline: none;
          cursor: pointer; flex-shrink: 0; width: 96px; transition: border-color .15s;
        }
        .bd2-cc:focus { border-color: var(--g); box-shadow: 0 0 0 3px rgba(11,191,119,.12); background: #fff; }
        .bd2-wa-note { font-size: .68rem; color: var(--t3); display: flex; align-items: center; gap: 4px; }

        /* Select */
        .bd2-sel {
          background: var(--inp); border: 1.5px solid transparent; border-radius: 8px;
          padding: 10px 12px; font-size: .85rem; color: var(--t1);
          font-family: var(--font-dm), sans-serif; outline: none;
          cursor: pointer; width: 100%; box-sizing: border-box; transition: border-color .15s;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23738A7B' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px;
        }
        .bd2-sel:focus { border-color: var(--g); box-shadow: 0 0 0 3px rgba(11,191,119,.12); background-color: #fff; }

        /* Divider */
        .bd2-divider { border: none; border-top: 1px solid var(--bd); margin: .1rem 0; }

        /* Checkboxes */
        .bd2-check-row { display: flex; align-items: flex-start; gap: 9px; cursor: pointer; }
        .bd2-check { width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0; cursor: pointer; accent-color: var(--g); margin-top: 2px; }
        .bd2-check-label { font-size: .79rem; color: var(--t2); line-height: 1.5; }
        .bd2-check-label a { color: var(--g7); text-decoration: underline; }

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
              <div className="bd2-logo-ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" fill="white" />
                  <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652A11.94 11.94 0 0 0 12.045 24c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.48-8.447z" fill="white" fillOpacity=".25" />
                </svg>
              </div>
              <span className="bd2-logo-tx">WBMSG</span>
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

            {/* ── Business Contact ── */}
            <div className="bd2-section">Business Contact</div>

            <div className="bd2-field">
              <label className="bd2-label">WhatsApp Phone Number *</label>
              <div className="bd2-phone-row">
                <select
                  className="bd2-cc"
                  value={form.countryCode}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => set("countryCode", e.target.value)}
                >
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag} {c.code}</option>
                  ))}
                </select>
                <input
                  type="tel"
                  className={`bd2-inp${errors.phone ? " bd2-inp-err" : ""}`}
                  placeholder="Phone number"
                  value={form.phone}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => set("phone", e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="bd2-wa-note">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
                  <path d="M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.334.101 11.893c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652A11.94 11.94 0 0 0 12.045 24c6.585 0 11.946-5.336 11.949-11.896 0-3.176-1.24-6.165-3.48-8.447z" fillOpacity=".3" />
                </svg>
                Please ensure WhatsApp is active on this number
              </div>
              {errors.phone && <div className="bd2-err">{errors.phone}</div>}
            </div>

            <hr className="bd2-divider" />

            {/* ── Company Details ── */}
            <div className="bd2-section">Company Details</div>

            <div className="bd2-row bd2-row-2">
              <div className="bd2-field">
                <label className="bd2-label">Company Name *</label>
                <input
                  type="text"
                  className={`bd2-inp${errors.companyName ? " bd2-inp-err" : ""}`}
                  placeholder="Acme Pvt. Ltd."
                  value={form.companyName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => set("companyName", e.target.value)}
                />
                {errors.companyName && <div className="bd2-err">{errors.companyName}</div>}
              </div>
              <div className="bd2-field">
                <label className="bd2-label">Company Website *</label>
                <input
                  type="text"
                  className={`bd2-inp${errors.companyWebsite ? " bd2-inp-err" : ""}`}
                  placeholder="www.yourcompany.com"
                  value={form.companyWebsite}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => set("companyWebsite", e.target.value)}
                />
                {errors.companyWebsite && <div className="bd2-err">{errors.companyWebsite}</div>}
              </div>
            </div>

            <div className="bd2-field">
              <label className="bd2-label">Company Location *</label>
              <input
                type="text"
                className={`bd2-inp${errors.companyLocation ? " bd2-inp-err" : ""}`}
                placeholder="Mumbai, Maharashtra"
                maxLength={48}
                value={form.companyLocation}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set("companyLocation", e.target.value)}
              />
              {errors.companyLocation && <div className="bd2-err">{errors.companyLocation}</div>}
            </div>

            <div className="bd2-row bd2-row-2">
              <div className="bd2-field">
                <label className="bd2-label">Industry *</label>
                <select
                  className={`bd2-sel${errors.industry ? " bd2-inp-err" : ""}`}
                  value={form.industry}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setForm(f => ({ ...f, industry: e.target.value, subCategory: "" }));
                    setErrors(er => ({ ...er, industry: undefined }));
                  }}
                >
                  <option value="" disabled>Select industry</option>
                  {INDUSTRIES.map(ind => <option key={ind} value={ind}>{ind}</option>)}
                </select>
                {errors.industry && <div className="bd2-err">{errors.industry}</div>}
              </div>
              <div className="bd2-field">
                <label className="bd2-label">Category *</label>
                <select
                  className={`bd2-sel${errors.subCategory ? " bd2-inp-err" : ""}`}
                  value={form.subCategory}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => set("subCategory", e.target.value)}
                  disabled={!form.industry}
                >
                  <option value="" disabled>Select category</option>
                  {subCats.map(sc => <option key={sc} value={sc}>{sc}</option>)}
                </select>
                {errors.subCategory && <div className="bd2-err">{errors.subCategory}</div>}
              </div>
            </div>

            <div className="bd2-field">
              <label className="bd2-label">Annual Revenue *</label>
              <select
                className={`bd2-sel${errors.revenue ? " bd2-inp-err" : ""}`}
                value={form.revenue}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set("revenue", e.target.value)}
              >
                <option value="" disabled>Select annual revenue</option>
                {REVENUE_BANDS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              {errors.revenue && <div className="bd2-err">{errors.revenue}</div>}
            </div>

            <hr className="bd2-divider" />

            <label className="bd2-check-row">
              <input
                type="checkbox"
                className="bd2-check"
                checked={form.whatsappUpdates}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set("whatsappUpdates", e.target.checked)}
              />
              <span className="bd2-check-label">Get account updates and product news on WhatsApp</span>
            </label>

            <label className="bd2-check-row">
              <input
                type="checkbox"
                className="bd2-check"
                checked={form.termsAccepted}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set("termsAccepted", e.target.checked)}
              />
              <span className="bd2-check-label">
                By creating an account you agree to our{" "}
                <Link href="#" target="_blank" rel="noopener">Terms of Service</Link>{" "}
                and{" "}
                <Link href="#" target="_blank" rel="noopener">Privacy Policy</Link>
              </span>
            </label>
            {errors.termsAccepted && <div className="bd2-err">{errors.termsAccepted}</div>}

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