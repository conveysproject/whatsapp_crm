"use client";
import { JSX, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { OverduePanel } from "./_components/OverduePanel";
import { CancellationsPanel } from "./_components/CancellationsPanel";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface UsageOrg { organizationId: string; name: string; planTier: string; billable: number; bySource: Record<string, number> }
interface UsageReport {
  month: string;
  totals: { organizations: number; billable: number };
  percentiles: { p50: number; p90: number; p99: number; max: number };
  buckets: Record<string, number>;
  organizations: UsageOrg[];
}
type Mode = "follow" | "never" | "always";
interface Rule { category: string; mode: Mode }
interface RulesResponse { modes: Mode[]; rules: Rule[] }
interface BandCfg { upTo: number; inr: number; usd: number }
interface StatementRow { organizationId: string; name: string; month: string; payCurrency: "INR" | "USD"; messages: number; bandName: string; amountInr: number | null; amountUsd: number | null; status: string; hasLink: boolean }
interface StatementsResponse { month: string; totals: { statements: number; inr: number; usd: number }; statements: StatementRow[] }
interface BillingCfg { published: boolean; freeAllowance: number; alertsEnabled: boolean; chargingStartDate: string | null; gstRatePercent: number; seller: { legalName: string; address: string; gstin: string }; autoIssueEnabled: boolean; blockingMode: "off" | "watch" | "enforce"; bands: BandCfg[] }

const KNOWN_CATEGORIES = ["marketing", "utility", "authentication", "service", "authentication_international", "marketing_lite", "referral_conversion", "unknown"];
const MODE_HELP: Record<Mode, string> = {
  follow: "Follow Meta (count only when Meta charges)",
  never: "Never count",
  always: "Always count",
};

function useAdminFetch() {
  const { getToken } = useAuth();
  return async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}`, ...init?.headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json() as Promise<T>;
  };
}

function previousMonthKey(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function AdminBillingPage(): JSX.Element {
  const adminFetch = useAdminFetch();
  const qc = useQueryClient();
  const [month, setMonth] = useState(currentMonth());
  const [includeInternal, setIncludeInternal] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const usage = useQuery<{ data: UsageReport }>({
    queryKey: ["admin-billing-usage", month, includeInternal],
    queryFn: () => adminFetch(`/v1/admin/billing/usage?month=${month}&limit=200${includeInternal ? "&includeInternal=true" : ""}`),
    enabled: /^\d{4}-\d{2}$/.test(month),
  });
  const rules = useQuery<{ data: RulesResponse }>({
    queryKey: ["admin-billing-rules"],
    queryFn: () => adminFetch("/v1/admin/billing/count-rules"),
  });
  const save = useMutation({
    mutationFn: (r: Rule) => adminFetch("/v1/admin/billing/count-rules", { method: "PUT", body: JSON.stringify(r) }),
    onSuccess: () => {
      toast.success("Rule saved. It applies to messages recorded from now on (allow up to 1 minute).");
      void qc.invalidateQueries({ queryKey: ["admin-billing-rules"] });
    },
    onError: () => toast.error("Could not save the rule"),
  });

  const settings = useQuery<{ data: BillingCfg }>({
    queryKey: ["admin-billing-settings"],
    queryFn: () => adminFetch("/v1/admin/billing/settings"),
  });
  const [cfg, setCfg] = useState<BillingCfg | null>(null);
  useEffect(() => { if (settings.data) setCfg(settings.data.data); }, [settings.data]);
  const saveSettings = useMutation({
    mutationFn: (c: BillingCfg) => adminFetch("/v1/admin/billing/settings", { method: "PUT", body: JSON.stringify(c) }),
    onSuccess: () => { toast.success("Prices saved"); void qc.invalidateQueries({ queryKey: ["admin-billing-settings"] }); },
    onError: () => toast.error("Could not save: check that band limits go up and prices do not go down"),
  });
  const setBand = (i: number, key: keyof BandCfg, value: string) => {
    if (!cfg) return;
    const n = Number(value.replace(/,/g, ""));
    setCfg({ ...cfg, bands: cfg.bands.map((b, j) => (j === i ? { ...b, [key]: Number.isFinite(n) ? Math.trunc(n) : 0 } : b)) });
  };

  const [stMonth, setStMonth] = useState(currentMonth());
  const [stInternal, setStInternal] = useState(false);
  const [stDay, setStDay] = useState(new Date().toISOString().slice(0, 10));
  const statementsQ = useQuery<{ data: StatementsResponse }>({
    queryKey: ["admin-billing-statements", stMonth, stInternal],
    queryFn: () => adminFetch(`/v1/admin/billing/statements?month=${stMonth}${stInternal ? "&includeInternal=true" : ""}`),
    enabled: /^\d{4}-\d{2}$/.test(stMonth),
  });
  const prepare = useMutation({
    mutationFn: () => adminFetch("/v1/admin/billing/statements/generate", { method: "POST", body: JSON.stringify({ date: stDay }) }),
    onSuccess: () => { toast.success("Draft statements prepared"); void qc.invalidateQueries({ queryKey: ["admin-billing-statements"] }); },
    onError: () => toast.error("Could not prepare statements (the date may be in the future)"),
  });

  const issue = useMutation({
    mutationFn: () => adminFetch<{ data: { issued: number; noPayment: number; customQuote: number; paymentLinks: number } }>("/v1/admin/billing/statements/issue", { method: "POST", body: "{}" }),
    onSuccess: (r) => {
      if (r.data.issued > 0 && r.data.paymentLinks < r.data.issued) {
        toast.warning(`Issued ${r.data.issued}, but only ${r.data.paymentLinks} payment link(s) were created. The rest show "no link yet" and are retried daily. Check the payment settings.`);
      } else {
        toast.success(`Issued ${r.data.issued} (payment links created: ${r.data.paymentLinks}), no payment needed ${r.data.noPayment}, left as draft ${r.data.customQuote}`);
      }
      void qc.invalidateQueries({ queryKey: ["admin-billing-statements"] });
    },
    onError: (e: Error) => toast.error(e.message === "HTTP 409" ? "Could not issue: set and save a charging start date in the prices first" : `Could not issue (${e.message}). Nothing was changed.`),
  });
  const setCurrency = useMutation({
    mutationFn: (v: { organizationId: string; currency: "INR" | "USD" }) =>
      adminFetch("/v1/admin/billing/org-currency", { method: "PUT", body: JSON.stringify(v) }),
    onSuccess: () => { toast.success("Billing currency saved. It applies to links created from now on."); void qc.invalidateQueries({ queryKey: ["admin-billing-statements"] }); },
    onError: () => toast.error("Could not save the billing currency"),
  });
  const setStatus = useMutation({
    mutationFn: (v: { organizationId: string; month: string; status: "paid" | "void" }) =>
      adminFetch("/v1/admin/billing/statements/status", { method: "POST", body: JSON.stringify(v) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-billing-statements"] }); },
    onError: () => toast.error("That change is not allowed for this statement"),
  });

  const modeOf = (category: string): Mode => rules.data?.data.rules.find((r) => r.category === category)?.mode ?? "follow";
  const categories = [...new Set([...KNOWN_CATEGORIES, ...(rules.data?.data.rules.map((r) => r.category) ?? [])])];
  const report = usage.data?.data;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">
      <section>
        <h1 className="text-xl font-semibold text-gray-900">Message usage</h1>
        <p className="text-sm text-gray-500 mt-1">Messages Meta charges for, per organization, by calendar month (UTC) for comparing organizations. Customers are billed on their own cycle, starting on their registration day. Counts before 12 October 2026 are estimates.</p>
        <div className="flex items-center gap-4 mt-4">
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <label className="text-sm text-gray-600 flex items-center gap-2">
            <input type="checkbox" checked={includeInternal} onChange={(e) => setIncludeInternal(e.target.checked)} />
            Include our own organizations
          </label>
        </div>
        {usage.isLoading && <p className="text-sm text-gray-500 mt-4">Loading...</p>}
        {usage.isError && <p className="text-sm text-red-600 mt-4">Could not load usage.</p>}
        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
              {([
                ["Organizations", report.totals.organizations],
                ["Total messages", report.totals.billable],
                ["Median org", report.percentiles.p50],
                ["90th percentile", report.percentiles.p90],
                ["Largest org", report.percentiles.max],
              ] as Array<[string, number]>).map(([label, value]) => (
                <div key={label} className="bg-white border rounded p-3">
                  <div className="text-gray-500">{label}</div>
                  <div className="text-lg font-semibold">{value.toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-3 text-xs text-gray-600">
              {Object.entries(report.buckets).map(([b, n]) => (
                <span key={b} className="bg-gray-100 rounded px-2 py-1">{b}: {n}</span>
              ))}
            </div>
            <div className="overflow-x-auto bg-white border rounded mt-4">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr><th className="p-2">Organization</th><th className="p-2">Plan</th><th className="p-2 text-right">Messages</th><th className="p-2">By source</th></tr>
                </thead>
                <tbody>
                  {report.organizations.map((o) => (
                    <tr key={o.organizationId} className="border-t">
                      <td className="p-2">{o.name}</td>
                      <td className="p-2">{o.planTier}</td>
                      <td className="p-2 text-right font-medium">{o.billable.toLocaleString()}</td>
                      <td className="p-2 text-gray-500">{Object.entries(o.bySource).map(([k, v]) => `${k}: ${v.toLocaleString()}`).join(", ")}</td>
                    </tr>
                  ))}
                  {report.organizations.length === 0 && (
                    <tr><td colSpan={4} className="p-4 text-center text-gray-500">No messages counted in this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Prices and bands</h2>
        <p className="text-sm text-gray-500 mt-1">
          Customers see no prices, bands or bill until you tick &quot;Show prices to customers&quot;. Nothing is charged by this page; charging is a separate step.
        </p>
        {settings.isError && <p className="text-sm text-red-600 mt-3">Could not load prices.</p>}
        {cfg && (
          <div className="bg-white border rounded mt-4 p-4 space-y-4 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-48 text-gray-600">Free messages a month</span>
              <input type="number" min={0} value={cfg.freeAllowance} onChange={(e) => setCfg({ ...cfg, freeAllowance: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} className="border rounded px-2 py-1 w-32" />
            </label>
            <table className="w-full">
              <thead className="text-left text-gray-500"><tr><th className="py-1">Band</th><th>Up to (messages)</th><th>Monthly bill ₹</th><th>Monthly bill $</th></tr></thead>
              <tbody>
                {cfg.bands.map((b, i) => (
                  <tr key={i}>
                    <td className="py-1">Band {i + 1}{i === cfg.bands.length - 1 ? " (cap)" : ""}</td>
                    <td><input type="number" value={b.upTo} onChange={(e) => setBand(i, "upTo", e.target.value)} className="border rounded px-2 py-1 w-32" /></td>
                    <td><input type="number" value={b.inr} onChange={(e) => setBand(i, "inr", e.target.value)} className="border rounded px-2 py-1 w-28" /></td>
                    <td><input type="number" value={b.usd} onChange={(e) => setBand(i, "usd", e.target.value)} className="border rounded px-2 py-1 w-24" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-gray-500">The last band has no upper limit: customers never pay more than its price, however many messages they send.</p>
            <label className="flex items-center gap-3">
              <span className="w-48 text-gray-600">Charging starts (cycles starting on/after)</span>
              <input type="date" value={cfg.chargingStartDate ?? ""} onChange={(e) => setCfg({ ...cfg, chargingStartDate: e.target.value || null })} className="border rounded px-2 py-1" />
              <span className="text-gray-500">Empty = nothing can be issued or charged.</span>
            </label>
            <label className="flex items-center gap-3">
              <span className="w-48 text-gray-600">GST % added to INR statements</span>
              <input type="number" min={0} max={40} value={cfg.gstRatePercent} onChange={(e) => setCfg({ ...cfg, gstRatePercent: Math.min(40, Math.max(0, Math.trunc(Number(e.target.value) || 0))) })} className="border rounded px-2 py-1 w-24" />
              <span className="text-gray-500">0 = no tax line. Dollar statements are never taxed.</span>
            </label>
            <fieldset className="space-y-2">
              <legend className="text-gray-600">Seller shown on statements and PDFs</legend>
              <input aria-label="Seller legal name" placeholder="Legal name" value={cfg.seller.legalName} onChange={(e) => setCfg({ ...cfg, seller: { ...cfg.seller, legalName: e.target.value } })} className="border rounded px-2 py-1 w-full max-w-md block" />
              <input aria-label="Seller GST number" placeholder="Seller GST number (optional)" value={cfg.seller.gstin} onChange={(e) => setCfg({ ...cfg, seller: { ...cfg.seller, gstin: e.target.value.toUpperCase() } })} className="border rounded px-2 py-1 w-full max-w-md block font-mono" />
              <textarea aria-label="Seller address" placeholder="Seller address" rows={2} value={cfg.seller.address} onChange={(e) => setCfg({ ...cfg, seller: { ...cfg.seller, address: e.target.value } })} className="border rounded px-2 py-1 w-full max-w-md block" />
            </fieldset>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cfg.autoIssueEnabled} onChange={(e) => setCfg({ ...cfg, autoIssueEnabled: e.target.checked })} />
              <span>Issue statements automatically when each billing month ends (daily job; you can still void any statement)</span>
            </label>
            <label className="flex items-center gap-3">
              <span className="w-48 text-gray-600">Pause sending when unpaid</span>
              <select value={cfg.blockingMode} onChange={(e) => setCfg({ ...cfg, blockingMode: e.target.value as "off" | "watch" | "enforce" })} className="border rounded px-2 py-1">
                <option value="off">Off: no warnings, no blocking</option>
                <option value="watch">Watch: warn and record, block nothing</option>
                <option value="enforce">Enforce: refuse sends 7 days after the due date</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cfg.alertsEnabled} onChange={(e) => setCfg({ ...cfg, alertsEnabled: e.target.checked })} />
              <span>Email usage alerts to customers&apos; billing admins (50%, 80%, 95%, 100% of the free messages, new bands)</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={cfg.published} onChange={(e) => setCfg({ ...cfg, published: e.target.checked })} />
              <span className={cfg.published ? "font-semibold text-red-700" : ""}>Show prices to customers</span>
            </label>
            <button
              type="button"
              disabled={saveSettings.isPending}
              onClick={() => {
                if (cfg.published && !settings.data?.data.published && !window.confirm("Customers will immediately see these prices on their billing page. Continue?")) return;
                if (cfg.blockingMode === "enforce" && settings.data?.data.blockingMode !== "enforce" && !window.confirm("Customers with a statement more than 7 days overdue will be unable to send WhatsApp messages right away. Check the Overdue customers list first. Continue?")) return;
                if (cfg.alertsEnabled && !settings.data?.data.alertsEnabled && !window.confirm("Every customer organization that has reached an alert level this month will be emailed within the hour. Continue?")) return;
                saveSettings.mutate(cfg);
              }}
              className="bg-gray-900 text-white rounded px-4 py-1.5"
            >
              Save prices
            </button>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Statements</h2>
        <p className="text-sm text-gray-500 mt-1">Prepared automatically every day for the customers whose billing cycle ended that day (cycles start on each customer&apos;s registration day). Drafts are invisible to customers. Issuing (below) shows a statement to the customer; it collects no money. You mark payments received yourself.</p>
        <div className="flex items-center gap-3 mt-4">
          <label className="text-sm text-gray-600 flex items-center gap-2">Cycles started in
            <input type="month" value={stMonth} onChange={(e) => setStMonth(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </label>
          <label className="text-sm text-gray-600 flex items-center gap-2">
            <input type="checkbox" checked={stInternal} onChange={(e) => setStInternal(e.target.checked)} />
            Include our own organizations (Conveys)
          </label>
          <label className="text-sm text-gray-600 flex items-center gap-2">Re-run for cycles that ended on
            <input type="date" value={stDay} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStDay(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </label>
          <button type="button" disabled={prepare.isPending} onClick={() => prepare.mutate()} className="text-sm bg-gray-900 text-white rounded px-3 py-1">Prepare drafts</button>
          <button
            type="button"
            disabled={issue.isPending}
            onClick={() => { if (window.confirm("Customers will see these statements as due on their billing page. Nothing is collected automatically. Continue?")) issue.mutate(); }}
            className="text-sm bg-red-700 text-white rounded px-3 py-1"
          >
            Issue drafts
          </button>
        </div>
        {statementsQ.data && (
          <div className="overflow-x-auto bg-white border rounded mt-4">
            <p className="p-3 text-sm text-gray-600">{statementsQ.data.data.totals.statements} statements, total ₹{statementsQ.data.data.totals.inr.toLocaleString()} / ${statementsQ.data.data.totals.usd.toLocaleString()} if every one were charged</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500"><tr><th className="p-2">Organization</th><th className="p-2">Cycle from</th><th className="p-2">Pays in</th><th className="p-2 text-right">Messages</th><th className="p-2">Band</th><th className="p-2">₹ / $</th><th className="p-2">Status</th><th className="p-2"></th></tr></thead>
              <tbody>
                {statementsQ.data.data.statements.map((r) => (
                  <tr key={`${r.organizationId}-${r.month}`} className="border-t">
                    <td className="p-2">{r.name}</td>
                    <td className="p-2">{r.month}</td>
                    <td className="p-2">
                      <select
                        aria-label={`Billing currency for ${r.name}`}
                        value={r.payCurrency}
                        disabled={r.status !== "draft" || setCurrency.isPending}
                        onChange={(e) => setCurrency.mutate({ organizationId: r.organizationId, currency: e.target.value as "INR" | "USD" })}
                        className="border rounded px-1 py-0.5 text-xs"
                      >
                        <option value="INR">₹ INR (Razorpay)</option>
                        <option value="USD">$ USD (Razorpay, international)</option>
                      </select>
                    </td>
                    <td className="p-2 text-right">{r.messages.toLocaleString()}</td>
                    <td className="p-2">{r.bandName}</td>
                    <td className="p-2">{r.amountInr === null ? "Custom quote" : `₹${r.amountInr.toLocaleString()} / $${(r.amountUsd ?? 0).toLocaleString()}`}</td>
                    <td className="p-2">
                      {r.status}
                      {r.status === "issued" && !r.hasLink ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">no link yet</span> : null}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {r.status === "issued" && (
                        <button type="button" onClick={() => setStatus.mutate({ organizationId: r.organizationId, month: r.month, status: "paid" })} className="text-xs border rounded px-2 py-0.5 mr-1">Mark paid</button>
                      )}
                      {(r.status === "draft" || r.status === "issued") && (
                        <button type="button" onClick={() => { if (window.confirm("Void this statement?")) setStatus.mutate({ organizationId: r.organizationId, month: r.month, status: "void" }); }} className="text-xs border rounded px-2 py-0.5">Void</button>
                      )}
                    </td>
                  </tr>
                ))}
                {statementsQ.data.data.statements.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-gray-500">No statements for cycles that started in this month.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <OverduePanel />

      <CancellationsPanel />

      <section>
        <h2 className="text-lg font-semibold text-gray-900">Counting rules</h2>
        <p className="text-sm text-gray-500 mt-1">
          By default a message counts only when Meta charges for it. Override a Meta category here if Meta changes its pricing.
          A change applies to messages recorded from now on, not to earlier ones.
        </p>
        {rules.isError && <p className="text-sm text-red-600 mt-3">Could not load rules.</p>}
        <div className="bg-white border rounded mt-4 divide-y">
          {categories.map((c) => (
            <div key={c} className="flex items-center justify-between p-3 text-sm">
              <span className="font-mono">{c}</span>
              <select
                value={modeOf(c)}
                disabled={save.isPending}
                onChange={(e) => save.mutate({ category: c, mode: e.target.value as Mode })}
                className="border rounded px-2 py-1"
              >
                {(["follow", "never", "always"] as Mode[]).map((m) => <option key={m} value={m}>{MODE_HELP[m]}</option>)}
              </select>
            </div>
          ))}
        </div>
        <form
          className="flex items-center gap-2 mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const c = newCategory.trim().toLowerCase();
            if (!/^[a-z_]{1,40}$/.test(c)) { toast.error("Use lower-case letters and underscores only"); return; }
            save.mutate({ category: c, mode: "never" });
            setNewCategory("");
          }}
        >
          <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="new_meta_category" className="border rounded px-2 py-1 text-sm font-mono" />
          <button type="submit" className="text-sm bg-gray-900 text-white rounded px-3 py-1">Add category (never count)</button>
        </form>
      </section>
    </div>
  );
}
