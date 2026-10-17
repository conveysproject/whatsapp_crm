"use client";

import { useEffect, type ChangeEvent, type JSX } from "react";
import Link from "next/link";
import type { BusinessValues, FieldErrors } from "@/lib/auth/signup-steps";

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
  "Less than $10K", "$10K – $50K", "$50K – $100K",
  "$100K – $500K", "$500K – $5M", "$5M – $50M",
  "More than $50M",
];


const BUSINESS_FIELDS_CSS = `
  .bd2-fields {
    --g: #0BBF77; --g7: #089058; --g50: #F0FBF6; --g100: #D9F5EB; --g200: #B0E8D0; --g900: #08452E;
    --t1: #0C1A10; --t2: #374D3E; --t3: #738A7B; --bd: #E0EBE5; --err: #DC2626;
    --inp: #F4F6FC;
    display: flex; flex-direction: column; gap: .9rem;
  }
  /* Section labels */
  .bd2-section {
    font-family: var(--font-br, var(--font-dm, system-ui)), system-ui, sans-serif; font-size: .72rem; font-weight: 700;
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

`;

/** Shared company/business fields + terms checkbox (sign-up screen 2 and the business-details page). */
export function BusinessFields({
  values,
  errors,
  onChange,
  showCompanyName = true,
}: {
  values: BusinessValues;
  errors: FieldErrors<BusinessValues>;
  onChange: (patch: Partial<BusinessValues>) => void;
  showCompanyName?: boolean;
}): JSX.Element {
  useEffect(() => {
    const w = values.companyWebsite;
    if (w && !w.startsWith("www.") && !w.startsWith("http")) onChange({ companyWebsite: "www." + w });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.companyWebsite]);

  const subCats = values.industry ? (SUB_CATEGORIES[values.industry] ?? []) : [];

  return (
    <div className="bd2-fields">
      <style>{BUSINESS_FIELDS_CSS}</style>
            {/* ── Company Details ── */}
            <div className="bd2-section">Company Details</div>

            {showCompanyName && (
              <div className="bd2-field">
                <label className="bd2-label">Company Name *</label>
                <input
                  type="text"
                  className={`bd2-inp${errors.companyName ? " bd2-inp-err" : ""}`}
                  placeholder="Your company name"
                  maxLength={255}
                  value={values.companyName}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ companyName: e.target.value })}
                />
                {errors.companyName && <div className="bd2-err">{errors.companyName}</div>}
              </div>
            )}

            <div className="bd2-row bd2-row-2">
              <div className="bd2-field">
                <label className="bd2-label">Company Website *</label>
                <input
                  type="text"
                  className={`bd2-inp${errors.companyWebsite ? " bd2-inp-err" : ""}`}
                  placeholder="www.yourcompany.com"
                  value={values.companyWebsite}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ companyWebsite: e.target.value })}
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
                value={values.companyLocation}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ companyLocation: e.target.value })}
              />
              {errors.companyLocation && <div className="bd2-err">{errors.companyLocation}</div>}
            </div>

            <div className="bd2-row bd2-row-2">
              <div className="bd2-field">
                <label className="bd2-label">Industry *</label>
                <select
                  className={`bd2-sel${errors.industry ? " bd2-inp-err" : ""}`}
                  value={values.industry}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ industry: e.target.value, subCategory: "" })}
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
                  value={values.subCategory}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ subCategory: e.target.value })}
                  disabled={!values.industry}
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
                value={values.revenue}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange({ revenue: e.target.value })}
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
                checked={values.termsAccepted}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ termsAccepted: e.target.checked })}
              />
              <span className="bd2-check-label">
                By creating an account you agree to our{" "}
                <Link href="#" target="_blank" rel="noopener">Terms of Service</Link>{" "}
                and{" "}
                <Link href="#" target="_blank" rel="noopener">Privacy Policy</Link>
              </span>
            </label>
            {errors.termsAccepted && <div className="bd2-err">{errors.termsAccepted}</div>}
    </div>
  );
}
