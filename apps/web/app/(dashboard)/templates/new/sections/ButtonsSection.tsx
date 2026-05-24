"use client";
import { type JSX } from "react";
import type { TemplateFormState, ButtonDef, OtpType } from "../templateFormTypes";
import { LIMITS } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

function newButton(type: ButtonDef['type']): ButtonDef {
  return { id: crypto.randomUUID(), type, text: '', url: '', urlIsDynamic: false, urlExample: '', phone: '', couponExample: '' };
}

function ButtonRow({ btn, onChange, onRemove }: {
  btn: ButtonDef;
  onChange: (b: ButtonDef) => void;
  onRemove: () => void;
}): JSX.Element {
  const field = (key: keyof ButtonDef, value: string | boolean) => onChange({ ...btn, [key]: value });

  return (
    <div className="rounded-lg border border-gray-200 p-3 space-y-2 bg-gray-50">
      <div className="flex items-center gap-2">
        <select
          value={btn.type}
          onChange={(e) => onChange({ ...newButton(e.target.value as ButtonDef['type']), id: btn.id })}
          className="rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="quick_reply">Quick Reply</option>
          <option value="url">URL</option>
          <option value="phone_number">Phone Number</option>
          <option value="copy_code">Copy Code</option>
        </select>
        <input
          value={btn.text}
          onChange={(e) => field('text', e.target.value)}
          maxLength={LIMITS.buttonLabel}
          placeholder="Button label"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 transition-colors text-lg leading-none">×</button>
      </div>

      {btn.type === 'url' && (
        <div className="space-y-1.5">
          <input
            value={btn.url}
            onChange={(e) => field('url', e.target.value)}
            maxLength={LIMITS.buttonUrl}
            placeholder="https://example.com or https://example.com/{{1}}"
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={btn.urlIsDynamic} onChange={(e) => field('urlIsDynamic', e.target.checked)} className="rounded" />
            <span className="text-xs text-gray-600">Dynamic URL (has variable at end)</span>
          </label>
          {btn.urlIsDynamic && (
            <input
              value={btn.urlExample}
              onChange={(e) => field('urlExample', e.target.value)}
              placeholder="Example URL (for Meta review)"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          )}
        </div>
      )}

      {btn.type === 'phone_number' && (
        <input
          value={btn.phone}
          onChange={(e) => field('phone', e.target.value)}
          maxLength={LIMITS.buttonPhone}
          placeholder="+15550001234"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      )}

      {btn.type === 'copy_code' && (
        <input
          value={btn.couponExample}
          onChange={(e) => field('couponExample', e.target.value)}
          maxLength={LIMITS.couponCode}
          placeholder="Example code (max 20 chars)"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      )}
    </div>
  );
}

function AuthButtonSection({ state, onChange }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-gray-700">OTP Button</label>
      <div className="grid grid-cols-3 gap-2">
        {(['copy_code', 'one_tap', 'zero_tap'] as OtpType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onChange({ otpType: t })}
            className={`py-2 rounded-lg border text-sm transition-colors ${
              state.otpType === t
                ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            {t === 'copy_code' ? 'Copy Code' : t === 'one_tap' ? 'One-Tap Autofill' : 'Zero-Tap'}
          </button>
        ))}
      </div>
      <input
        value={state.otpButtonText}
        onChange={(e) => onChange({ otpButtonText: e.target.value })}
        maxLength={25}
        placeholder="Custom button label (optional, defaults to 'Copy Code')"
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
      {state.otpType === 'one_tap' && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2">
          One-tap autofill requires your Android app&apos;s package name and signature hash to be registered with Meta separately.
        </p>
      )}
    </div>
  );
}

export function ButtonsSection({ state, onChange }: Props): JSX.Element {
  if (state.category === 'authentication') return <AuthButtonSection state={state} onChange={onChange} />;

  const isLto = state.subType === 'lto';
  const isCoupon = state.subType === 'coupon';

  function updateButton(id: string, updated: ButtonDef): void {
    onChange({ buttons: state.buttons.map((b) => (b.id === id ? updated : b)) });
  }
  function removeButton(id: string): void {
    onChange({ buttons: state.buttons.filter((b) => b.id !== id) });
  }
  function addButton(type: ButtonDef['type']): void {
    onChange({ buttons: [...state.buttons, newButton(type)] });
  }

  const total = state.buttons.length;
  const atMax = total >= LIMITS.totalButtons;
  const phoneCount = state.buttons.filter((b) => b.type === 'phone_number').length;
  const copyCount = state.buttons.filter((b) => b.type === 'copy_code').length;
  const urlCount = state.buttons.filter((b) => b.type === 'url').length;

  function AddBtn({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }): JSX.Element {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-600 hover:border-gray-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-gray-700">
        Buttons <span className="text-xs text-gray-400 font-normal">optional — up to {LIMITS.totalButtons}</span>
      </label>

      {isCoupon && (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Copy Code button is automatically added for coupon templates. Add optional Quick Reply buttons below.
        </div>
      )}
      {isLto && (
        <div className="rounded-lg border border-dashed border-brand-300 bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Copy Code button is auto-added. Add URL buttons below. No quick reply allowed in LTO.
        </div>
      )}

      {state.buttons.map((btn) => (
        <ButtonRow key={btn.id} btn={btn} onChange={(b) => updateButton(btn.id, b)} onRemove={() => removeButton(btn.id)} />
      ))}

      <div className="flex gap-2 flex-wrap">
        {!isLto && (
          <AddBtn label="+ Quick Reply" onClick={() => addButton('quick_reply')} disabled={atMax} />
        )}
        {!isCoupon && (
          <AddBtn label="+ URL" onClick={() => addButton('url')} disabled={atMax || urlCount >= LIMITS.urlButtons} />
        )}
        {!isCoupon && !isLto && (
          <>
            <AddBtn label="+ Phone Number" onClick={() => addButton('phone_number')} disabled={atMax || phoneCount >= LIMITS.phoneNumberButtons} />
            <AddBtn label="+ Copy Code" onClick={() => addButton('copy_code')} disabled={atMax || copyCount >= LIMITS.copyCodeButtons} />
          </>
        )}
      </div>

      {atMax && (
        <p className="text-xs text-red-500">You have reached the maximum {LIMITS.totalButtons} buttons allowed by Meta.</p>
      )}
    </div>
  );
}
