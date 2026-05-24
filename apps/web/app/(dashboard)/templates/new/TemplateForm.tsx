"use client";
import { useState, useMemo, type JSX } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { BasicSection } from "./sections/BasicSection";
import { HeaderSection } from "./sections/HeaderSection";
import { BodySection } from "./sections/BodySection";
import { FooterSection } from "./sections/FooterSection";
import { ButtonsSection } from "./sections/ButtonsSection";
import { LtoSection } from "./sections/LtoSection";
import { CarouselSection } from "./sections/CarouselSection";
import { VariableExamplesSection } from "./sections/VariableExamplesSection";
import { TemplatePreview } from "@/components/templates/TemplatePreview";
import { buildComponents, validateForm } from "./buildComponents";
import { INITIAL_STATE } from "./templateFormTypes";
import type { TemplateFormState } from "./templateFormTypes";

function SectionCard({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

export function TemplateForm(): JSX.Element {
  const { getToken } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<TemplateFormState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function patch(p: Partial<TemplateFormState>): void {
    setState((s) => ({ ...s, ...p }));
  }

  const components = useMemo(() => {
    try { return buildComponents(state); } catch { return []; }
  }, [state]);

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
          category: state.category.toUpperCase(),
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
        await fetch(`${apiUrl}/v1/templates/${data.id}/submit`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token ?? ''}` },
        });
      }
      router.push('/templates');
    } finally {
      setSaving(false);
    }
  }

  const showHeader = state.category !== 'authentication' && state.subType !== 'carousel';
  const showCarousel = state.subType === 'carousel';
  const showLto = state.subType === 'lto';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 items-start">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">New Template</h1>
        </div>

        <SectionCard title="Basics">
          <BasicSection state={state} onChange={patch} />
        </SectionCard>

        {showHeader && (
          <SectionCard title="Header">
            <HeaderSection state={state} onChange={patch} />
          </SectionCard>
        )}

        <SectionCard title="Body">
          <BodySection state={state} onChange={patch} />
        </SectionCard>

        {showLto && (
          <LtoSection state={state} onChange={patch} />
        )}

        {showCarousel && (
          <SectionCard title="Carousel cards">
            <CarouselSection state={state} onChange={patch} />
          </SectionCard>
        )}

        <SectionCard title="Footer">
          <FooterSection state={state} onChange={patch} />
        </SectionCard>

        <SectionCard title="Buttons">
          <ButtonsSection state={state} onChange={patch} />
        </SectionCard>

        <VariableExamplesSection state={state} onChange={patch} />

        {errors.length > 0 && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-1">
            {errors.map((e, i) => <p key={i} className="text-sm text-red-600">{e}</p>)}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { void handleSubmit(false); }}
            disabled={saving || !state.name}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:border-gray-400 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            onClick={() => { void handleSubmit(true); }}
            disabled={saving || !state.name}
            className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save & Submit to Meta'}
          </button>
        </div>
      </div>

      <div className="sticky top-4 space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Preview</p>
        <TemplatePreview components={components} templateName={state.name || undefined} />
      </div>
    </div>
  );
}
