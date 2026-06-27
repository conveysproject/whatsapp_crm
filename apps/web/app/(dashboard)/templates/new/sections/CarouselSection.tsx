"use client";
import type { JSX } from "react";
import type { TemplateFormState, CarouselCard, CarouselButtonDef } from "../templateFormTypes";
import { LIMITS } from "../templateFormTypes";

interface Props {
  state: TemplateFormState;
  onChange: (patch: Partial<TemplateFormState>) => void;
}

function newCarouselButton(type: CarouselButtonDef['type']): CarouselButtonDef {
  return { id: crypto.randomUUID(), type, text: '', url: '', urlIsDynamic: false, urlExample: '', phone: '' };
}

function CardEditor({ card, index, onChange, onRemove, canRemove }: {
  card: CarouselCard;
  index: number;
  onChange: (c: CarouselCard) => void;
  onRemove: () => void;
  canRemove: boolean;
}): JSX.Element {
  function updateBtn(id: string, b: CarouselButtonDef): void {
    onChange({ ...card, buttons: card.buttons.map((cb) => (cb.id === id ? b : cb)) });
  }
  function removeBtn(id: string): void {
    onChange({ ...card, buttons: card.buttons.filter((cb) => cb.id !== id) });
  }
  function addBtn(type: CarouselButtonDef['type']): void {
    onChange({ ...card, buttons: [...card.buttons, newCarouselButton(type)] });
  }

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Card {index + 1}</span>
        {canRemove && (
          <button type="button" onClick={onRemove} className="text-xs text-red-500 hover:text-red-600">Remove</button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Header image/video URL <span className="text-red-500">*</span></label>
        <input
          value={card.headerMediaUrl}
          onChange={(e) => onChange({ ...card, headerMediaUrl: e.target.value })}
          placeholder="https://example.com/image.jpg"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-gray-500">Card body text <span className="text-gray-400">(optional — if any card has body, all must)</span></label>
        <textarea
          value={card.bodyText}
          onChange={(e) => onChange({ ...card, bodyText: e.target.value })}
          rows={2}
          placeholder="Card body text"
          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
        />
        <p className={`text-xs mt-0.5 ${(card.bodyText?.length ?? 0) > 60 ? 'text-red-500' : 'text-gray-400'}`}>
          {card.bodyText?.length ?? 0}/60
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500">Buttons (max {LIMITS.carouselButtonsPerCard})</label>
        {card.buttons.map((btn) => (
          <div key={btn.id} className="flex flex-col gap-1.5 rounded border border-gray-200 p-2 bg-gray-50">
            <div className="flex gap-2 items-center">
              <select
                value={btn.type}
                onChange={(e) => updateBtn(btn.id, { ...newCarouselButton(e.target.value as CarouselButtonDef['type']), id: btn.id })}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                <option value="quick_reply">Quick Reply</option>
                <option value="url">URL</option>
                <option value="phone_number">Phone</option>
              </select>
              <input
                value={btn.text}
                onChange={(e) => updateBtn(btn.id, { ...btn, text: e.target.value })}
                maxLength={25}
                placeholder="Label"
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <button type="button" onClick={() => removeBtn(btn.id)} className="text-gray-400 hover:text-red-500">×</button>
            </div>
            {btn.type === 'url' && (
              <>
                <input
                  value={btn.url}
                  onChange={(e) => updateBtn(btn.id, { ...btn, url: e.target.value })}
                  placeholder="https://example.com/{{1}}"
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={btn.urlIsDynamic} onChange={(e) => updateBtn(btn.id, { ...btn, urlIsDynamic: e.target.checked })} className="rounded" />
                  Dynamic URL
                </label>
                {btn.urlIsDynamic && (
                  <input
                    value={btn.urlExample}
                    onChange={(e) => updateBtn(btn.id, { ...btn, urlExample: e.target.value })}
                    placeholder="Example URL"
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  />
                )}
              </>
            )}
            {btn.type === 'phone_number' && (
              <input
                value={btn.phone}
                onChange={(e) => updateBtn(btn.id, { ...btn, phone: e.target.value })}
                placeholder="+15550001234"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
            )}
          </div>
        ))}
        {card.buttons.length < LIMITS.carouselButtonsPerCard && (
          <div className="flex gap-2">
            <button type="button" onClick={() => addBtn('quick_reply')} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-gray-400">+ Quick Reply</button>
            <button type="button" onClick={() => addBtn('url')} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-gray-400">+ URL</button>
            <button type="button" onClick={() => addBtn('phone_number')} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:border-gray-400">+ Phone</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CarouselSection({ state, onChange }: Props): JSX.Element | null {
  if (state.subType !== 'carousel') return null;

  function updateCard(id: string, card: CarouselCard): void {
    onChange({ cards: state.cards.map((c) => (c.id === id ? card : c)) });
  }
  function removeCard(id: string): void {
    onChange({ cards: state.cards.filter((c) => c.id !== id) });
  }
  function addCard(): void {
    onChange({ cards: [...state.cards, { id: crypto.randomUUID(), headerMediaUrl: '', bodyText: '', buttons: [] }] });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">
          Carousel cards <span className="text-xs text-gray-400 font-normal">2–10 cards, all must have same components</span>
        </label>
        <span className="text-xs text-gray-500">{state.cards.length}/10</span>
      </div>

      {state.cards.map((card, i) => (
        <CardEditor
          key={card.id}
          card={card}
          index={i}
          onChange={(c) => updateCard(card.id, c)}
          onRemove={() => removeCard(card.id)}
          canRemove={state.cards.length > LIMITS.carouselCards.min}
        />
      ))}

      {state.cards.length < LIMITS.carouselCards.max && (
        <button
          type="button"
          onClick={addCard}
          className="rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          + Add card
        </button>
      )}
    </div>
  );
}
