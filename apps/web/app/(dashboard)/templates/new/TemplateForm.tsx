"use client";
import { useState, useMemo, useEffect, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { HeaderSection } from "./sections/HeaderSection";
import { BodySection } from "./sections/BodySection";
import { FooterSection } from "./sections/FooterSection";
import { ButtonsSection } from "./sections/ButtonsSection";
import { LtoSection } from "./sections/LtoSection";
import { CarouselSection } from "./sections/CarouselSection";
import { VariableExamplesSection } from "./sections/VariableExamplesSection";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { buildComponents, validateForm } from "./buildComponents";
import { INITIAL_STATE, LANGUAGES } from "./templateFormTypes";
import type { TemplateFormState, TemplateCategory, SubType } from "./templateFormTypes";

// ─── Stepper ────────────────────────────────────────────────────────────────

const STEPS = ['Set up template', 'Edit template', 'Submit for Review'];

function Stepper({ current }: { current: number }): JSX.Element {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                done ? 'bg-brand-600 border-brand-600 text-white'
                  : active ? 'border-brand-600 text-brand-600 bg-white'
                  : 'border-gray-300 text-gray-400 bg-white'
              }`}>
                {done ? '✓' : n}
              </div>
              <span className={`text-sm font-medium whitespace-nowrap ${active ? 'text-brand-700' : done ? 'text-gray-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`w-8 h-px mx-3 ${n < current ? 'bg-brand-600' : 'bg-gray-300'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 1: Set up template ─────────────────────────────────────────────────

const CATEGORIES: { value: TemplateCategory; icon: string; label: string; description: string }[] = [
  { value: 'marketing', icon: '📢', label: 'Marketing', description: 'Promotions, offers, awareness, retargeting' },
  { value: 'utility', icon: '🔔', label: 'Utility', description: 'Non-promotional — order updates, alerts, account notices' },
  { value: 'authentication', icon: '🔑', label: 'Authentication', description: 'Identity verification with a one-time passcode' },
];

const MARKETING_SUB_TYPES: { value: SubType; label: string; description: string }[] = [
  { value: 'standard', label: 'Default', description: 'Send messages with media and customised buttons to engage your customers.' },
  { value: 'coupon', label: 'Coupon Code', description: 'Share a discount code with a copy button for easy redemption.' },
  { value: 'lto', label: 'Limited-Time Offer', description: 'Create urgency with a time-sensitive promotion and countdown timer.' },
  { value: 'carousel', label: 'Carousel', description: 'Showcase multiple products or services in a scrollable card format.' },
];

function Step1({ state, onChange }: { state: TemplateFormState; onChange: (p: Partial<TemplateFormState>) => void }): JSX.Element {
  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Set up your template</h2>
          <p className="text-sm text-gray-500 mt-1">
            Choose the category that best describes your message template, then select the type of message you want to send.
          </p>
        </div>
        <a
          href="https://business.facebook.com/business/help/2055875911147364"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-gray-400 hover:text-gray-800 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path d="M12 16v-4m0-4h.01" strokeWidth="2" strokeLinecap="round"/></svg>
          Help
        </a>
      </div>

      {/* Meta management banner */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center justify-between gap-4 text-sm text-gray-600">
        <p>Authentication and Flow templates can be sent from here, but must be created or edited directly on Meta.</p>
        <a
          href="https://business.facebook.com/wa/manage/message-templates/"
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:border-gray-400 transition-colors whitespace-nowrap"
        >
          Manage on Meta
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
      </div>

      {/* Category tabs */}
      <div>
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => onChange({ category: cat.value, subType: 'standard' })}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors border-r last:border-r-0 border-gray-200 ${
                state.category === cat.value
                  ? 'bg-gray-100 text-gray-900'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sub-type radio list (marketing only) */}
      {state.category === 'marketing' && (
        <div className="space-y-2">
          {MARKETING_SUB_TYPES.map((st) => (
            <label
              key={st.value}
              className={`flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors ${
                state.subType === st.value
                  ? 'border-brand-500 bg-brand-50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="subType"
                value={st.value}
                checked={state.subType === st.value}
                onChange={() => onChange({ subType: st.value })}
                className="mt-0.5 accent-brand-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">{st.label}</p>
                <p className="text-sm text-gray-500">{st.description}</p>
              </div>
            </label>
          ))}
        </div>
      )}

      {/* Utility info */}
      {state.category === 'utility' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700 space-y-2">
            <p className="font-medium text-gray-900">What qualifies as Utility</p>
            <p>Non-promotional messages that are either <span className="font-medium">requested by the user</span> (order/account/transaction-specific) or <span className="font-medium">essential to the user</span> (fraud alerts, safety notices, legal disclosures).</p>
            <div className="pt-1 space-y-1">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Common use cases</p>
              <p className="text-xs text-gray-600">Order confirmations · Shipping updates · Payment reminders · Account alerts · Opt-in/opt-out confirmations · Feedback on a specific order</p>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium">Watch out</p>
            <p>Any promotional intent (upselling, offers, cross-selling) will cause Meta to reclassify the template as Marketing — even if you chose Utility. Generic surveys not tied to a specific order will also be rejected.</p>
          </div>
        </div>
      )}

      {/* Auth info */}
      {state.category === 'authentication' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800 space-y-2">
            <p className="font-medium text-blue-900">What qualifies as Authentication</p>
            <p>Verifying a user&apos;s identity with a one-time passcode — at account creation, login, account recovery, or transaction verification.</p>
            <div className="pt-1 space-y-1">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Restrictions (enforced by Meta)</p>
              <p className="text-xs text-blue-700">Body text is preset — you cannot customise it · No URLs, media, or emojis · Variable parameters max 15 characters · OTP button required (Copy Code, One-Tap, or Zero-Tap)</p>
            </div>
          </div>
          <div className="rounded-lg border border-blue-100 bg-white p-3 text-xs text-gray-600">
            <p className="font-medium text-gray-700 mb-1">How it looks to your customer</p>
            <p className="font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-800">{`{{1}} is your verification code. For your security, do not share this code.`}</p>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Step 2: Edit template ────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

function Step2({ state, onChange }: { state: TemplateFormState; onChange: (p: Partial<TemplateFormState>) => void }): JSX.Element {
  const showHeader = state.category !== 'authentication' && state.subType !== 'carousel';

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Edit template</h2>
        <p className="text-sm text-gray-500 mt-1">Build your message content. Variables, buttons, and media can be added here.</p>
      </div>

      <SectionCard title="Template name and language">
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Name your template <span className="text-red-500">*</span></label>
          <div className="relative">
            <input
              value={state.name}
              onChange={(e) => onChange({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
              placeholder="Enter a template name"
              maxLength={512}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 pr-14"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{state.name.length}/512</span>
          </div>
          <p className="text-xs text-gray-400">Lowercase letters, numbers, and underscores only.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-1">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Select language <span className="text-red-500">*</span></label>
            <select
              value={state.language}
              onChange={(e) => onChange({ language: e.target.value })}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>{l.label} ({l.code})</option>
              ))}
            </select>
          </div>
          {state.category !== 'authentication' && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Variable format</label>
              <select
                value={state.parameterFormat}
                onChange={(e) => onChange({ parameterFormat: e.target.value as 'positional' | 'named' })}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="positional">Positional — {'{{1}}'}, {'{{2}}'}</option>
                <option value="named">Named — {'{{first_name}}'}</option>
              </select>
            </div>
          )}
        </div>
        {state.category !== 'authentication' && (
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-xs text-gray-500 space-y-1">
            <p>Variables are placeholders used to dynamically insert specific information into your template. You can use either a name or number as a variable.</p>
            <p className="font-medium text-gray-600 pt-0.5">Examples:</p>
            <p>Name: <code className="font-mono bg-white border border-gray-200 rounded px-1">{'{{order_id}}'}</code></p>
            <p>Number: <code className="font-mono bg-white border border-gray-200 rounded px-1">{'{{1}}'}</code></p>
          </div>
        )}
      </SectionCard>

      {showHeader && (
        <SectionCard title="Header">
          <HeaderSection state={state} onChange={onChange} />
        </SectionCard>
      )}

      <SectionCard title="Body">
        <BodySection state={state} onChange={onChange} />
      </SectionCard>

      {state.subType === 'lto' && <LtoSection state={state} onChange={onChange} />}

      {state.subType === 'carousel' && (
        <SectionCard title="Carousel cards">
          <CarouselSection state={state} onChange={onChange} />
        </SectionCard>
      )}

      <SectionCard title="Footer">
        <FooterSection state={state} onChange={onChange} />
      </SectionCard>

      <SectionCard title="Buttons">
        <ButtonsSection state={state} onChange={onChange} />
      </SectionCard>
    </div>
  );
}

// ─── Step 3: Submit for Review ───────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex items-start gap-4 py-3 border-b border-gray-100 last:border-0">
      <span className="w-36 shrink-0 text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-900 font-medium">{value}</span>
    </div>
  );
}

function Step3({ state, onChange, errors }: {
  state: TemplateFormState;
  onChange: (p: Partial<TemplateFormState>) => void;
  errors: string[];
}): JSX.Element {
  const categoryLabel = state.category.charAt(0).toUpperCase() + state.category.slice(1);
  const subTypeLabel = state.subType === 'lto' ? 'Limited-Time Offer'
    : state.subType === 'coupon' ? 'Coupon Code'
    : state.subType === 'carousel' ? 'Carousel'
    : 'Default';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Submit for Review</h2>
        <p className="text-sm text-gray-500 mt-1">Review your template details before submitting to Meta. Review usually takes 24 hours.</p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Summary</h3>
        <ReviewRow label="Name" value={state.name || '—'} />
        <ReviewRow label="Category" value={categoryLabel} />
        {state.category === 'marketing' && <ReviewRow label="Type" value={subTypeLabel} />}
        <ReviewRow label="Language" value={state.language} />
        <ReviewRow label="Variable format" value={state.parameterFormat} />
        {state.bodyText && <ReviewRow label="Body (preview)" value={state.bodyText.substring(0, 80) + (state.bodyText.length > 80 ? '…' : '')} />}
        {state.buttons.length > 0 && <ReviewRow label="Buttons" value={`${state.buttons.length} button${state.buttons.length !== 1 ? 's' : ''}`} />}
      </div>

      <VariableExamplesSection state={state} onChange={onChange} />

      {errors.length > 0 && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 space-y-1">
          <p className="text-sm font-medium text-red-700">Please fix these before submitting:</p>
          {errors.map((e, i) => <p key={i} className="text-sm text-red-600">• {e}</p>)}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-medium">Before you submit</p>
        <p className="mt-1 text-amber-700">Meta reviews all templates before approval. Templates that violate policies may be rejected. Review typically takes a few minutes to 24 hours.</p>
      </div>
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────

export function TemplateForm({ initialState = INITIAL_STATE }: { initialState?: TemplateFormState }): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<TemplateFormState>(initialState);
  // Skip step 1 (category selection) when pre-filled from the template library
  const [step, setStep] = useState(initialState !== INITIAL_STATE ? 2 : 1);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("from_ai") !== "true") return;
    try {
      const raw = sessionStorage.getItem("ai_template_draft");
      if (!raw) return;
      const draft = JSON.parse(raw) as TemplateFormState;
      setState(draft);
      sessionStorage.removeItem("ai_template_draft");
      // Auto-advance to step 2 (edit) so the user sees the pre-filled form
      setStep(2);
      // If auto-submit was flagged, advance to step 3
      const autoSubmit = sessionStorage.getItem("ai_template_auto_submit");
      if (autoSubmit === "true") {
        sessionStorage.removeItem("ai_template_auto_submit");
        setStep(3);
      }
    } catch { /* malformed sessionStorage — ignore */ }
  }, [searchParams]);

  function patch(p: Partial<TemplateFormState>): void {
    setState((s) => ({ ...s, ...p }));
  }

  const components = useMemo(() => {
    try { return buildComponents(state); } catch { return []; }
  }, [state]);

  function handleNext(): void {
    if (step === 2 && !state.name) {
      setErrors(['Template name is required.']);
      return;
    }
    setErrors([]);
    setStep((s) => Math.min(s + 1, 3));
  }

  async function handleSubmit(submitToMeta: boolean): Promise<void> {
    const errs = validateForm(state);
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setSaving(true);
    try {
      const token = await getToken();
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:4000';
      const res = await fetch(`${apiUrl}/v1/templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: state.name,
          category: state.category,
          language: state.language,
          components,
        }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: { message?: string } };
        setErrors([body.error?.message ?? 'Failed to create template']);
        return;
      }
      const { data } = await res.json() as { data: { id: string } };
      if (submitToMeta) {
        const submitRes = await fetch(`${apiUrl}/v1/templates/${data.id}/submit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
        if (!submitRes.ok) {
          const submitBody = await submitRes.json() as { error?: { message?: string } };
          setErrors([submitBody.error?.message ?? 'Failed to submit template to Meta']);
          return;
        }
      }
      router.push('/templates');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col -m-6 min-h-[calc(100vh-4rem)]">
      {/* Stepper bar */}
      <div className="bg-white border-b border-gray-200 px-8 py-4">
        <Stepper current={step} />
      </div>

      {/* Content + Preview */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] overflow-hidden">
        {/* Left: form */}
        <div className="overflow-y-auto p-8">
          {step === 1 && <Step1 state={state} onChange={patch} />}
          {step === 2 && <Step2 state={state} onChange={patch} />}
          {step === 3 && <Step3 state={state} onChange={patch} errors={errors} />}
        </div>

        {/* Right: preview */}
        <div className="border-l border-gray-200 bg-gray-50 p-6 overflow-y-auto">
          <p className="text-sm font-semibold text-gray-900 mb-4">Template preview</p>
          <TemplatePreview components={components} templateName={state.name || undefined} />
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="bg-white border-t border-gray-200 px-8 py-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/templates')}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400 transition-colors"
        >
          Discard
        </button>

        <div className="flex items-center gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={() => { setErrors([]); setStep((s) => s - 1); }}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400 transition-colors"
            >
              Back
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={step === 2 && !state.name}
              className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          ) : (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { void handleSubmit(false); }}
                disabled={saving}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                type="button"
                onClick={() => { void handleSubmit(true); }}
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Submitting…' : 'Submit for Review'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Inline errors for steps 1 & 2 */}
      {errors.length > 0 && step < 3 && (
        <div className="fixed bottom-20 right-8 max-w-sm rounded-lg bg-red-50 border border-red-200 p-3 shadow-lg space-y-1 z-50">
          {errors.map((e, i) => <p key={i} className="text-sm text-red-600">{e}</p>)}
        </div>
      )}
    </div>
  );
}
