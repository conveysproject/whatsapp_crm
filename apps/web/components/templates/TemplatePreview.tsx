import type { JSX } from "react";

interface TemplatePreviewProps {
  components: object[];
  templateName?: string;
}

type Comp = Record<string, unknown>;

function renderText(text: string): JSX.Element {
  const parts = text.split(/(\{\{[^}]+\}\}|\*[^*]+\*|_[^_]+_)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (/^\{\{[^}]+\}\}$/.test(part)) return <span key={i} className="text-brand-600 font-mono text-xs bg-brand-50 rounded px-0.5">{part}</span>;
        if (/^\*[^*]+\*$/.test(part)) return <strong key={i}>{part.slice(1, -1)}</strong>;
        if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function HeaderPreview({ comp }: { comp: Comp }): JSX.Element | null {
  const format = (comp.format as string | undefined)?.toUpperCase();
  if (!format || format === 'NONE') return null;
  if (format === 'TEXT') {
    return <p className="text-sm font-semibold text-gray-900 mb-1">{renderText((comp.text as string) ?? '')}</p>;
  }
  if (format === 'IMAGE') {
    return (
      <div className="w-full h-32 bg-gray-200 rounded-md flex items-center justify-center mb-2">
        <span className="text-gray-400 text-xs">📷 Image</span>
      </div>
    );
  }
  if (format === 'VIDEO') {
    return (
      <div className="w-full h-32 bg-gray-800 rounded-md flex items-center justify-center mb-2">
        <span className="text-gray-300 text-xs">▶ Video</span>
      </div>
    );
  }
  if (format === 'DOCUMENT') {
    return (
      <div className="w-full h-16 bg-gray-100 rounded-md flex items-center gap-2 px-3 mb-2">
        <span className="text-2xl">📄</span>
        <span className="text-xs text-gray-500">Document</span>
      </div>
    );
  }
  if (format === 'LOCATION') {
    return (
      <div className="w-full h-24 bg-green-50 rounded-md flex items-center justify-center mb-2 border border-green-200">
        <span className="text-green-600 text-xs">📍 Location</span>
      </div>
    );
  }
  return null;
}

function ButtonsPreview({ buttons }: { buttons: Comp[] }): JSX.Element {
  return (
    <div className="mt-1 border-t border-gray-100 pt-1 space-y-1">
      {buttons.map((btn, i) => {
        const type = (btn.type as string)?.toLowerCase();
        if (type === 'quick_reply') {
          return (
            <div key={i} className="text-center py-1.5 text-xs text-blue-600 border border-blue-200 rounded-md">
              {(btn.text as string) || 'Quick Reply'}
            </div>
          );
        }
        if (type === 'url') {
          return (
            <div key={i} className="text-center py-1.5 text-xs text-blue-600 border-t border-gray-100 flex items-center justify-center gap-1">
              <span>🔗</span> {(btn.text as string) || 'Visit Website'}
            </div>
          );
        }
        if (type === 'phone_number') {
          return (
            <div key={i} className="text-center py-1.5 text-xs text-blue-600 border-t border-gray-100 flex items-center justify-center gap-1">
              <span>📞</span> {(btn.text as string) || 'Call'}
            </div>
          );
        }
        if (type === 'copy_code' || type === 'otp') {
          return (
            <div key={i} className="text-center py-1.5 text-xs text-blue-600 border-t border-gray-100 flex items-center justify-center gap-1">
              <span>📋</span> {(btn.text as string) || 'Copy Code'}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

function CarouselCardPreview({ card, index }: { card: Record<string, unknown>; index: number }): JSX.Element {
  const cardComps = (card.components as Comp[] | undefined) ?? [];
  const header = cardComps.find((c) => c.type === 'header');
  const body = cardComps.find((c) => c.type === 'body');
  const btnComp = cardComps.find((c) => c.type === 'buttons');
  const buttons = (btnComp?.buttons as Comp[] | undefined) ?? [];

  return (
    <div className="w-36 shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden text-xs">
      {header && (header.format as string)?.toUpperCase() === 'VIDEO' ? (
        <div className="h-20 bg-gray-800 flex items-center justify-center text-gray-300">▶ Card {index + 1}</div>
      ) : (
        <div className="h-20 bg-gray-200 flex items-center justify-center text-gray-400">📷 Card {index + 1}</div>
      )}
      {Boolean(body?.text) && (
        <div className="px-2 py-1.5 text-gray-700">{(body?.text as string).substring(0, 60)}</div>
      )}
      {buttons.length > 0 && (
        <div className="border-t border-gray-100 px-2 py-1 space-y-1">
          {buttons.map((b, bi) => (
            <div key={bi} className="text-blue-600 text-center">{(b.text as string) || 'Button'}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TemplatePreview({ components, templateName }: TemplatePreviewProps): JSX.Element {
  const comps = components as Comp[];
  const header = comps.find((c) => c.type === 'header');
  const body = comps.find((c) => c.type === 'body');
  const footer = comps.find((c) => c.type === 'footer');
  const btnComp = comps.find((c) => c.type === 'buttons');
  const buttons = (btnComp?.buttons as Comp[] | undefined) ?? [];
  const ltoComp = comps.find((c) => c.type === 'limited_time_offer') as Comp | undefined;
  const carouselComp = comps.find((c) => c.type === 'carousel') as Comp | undefined;
  const isAuth = body && 'add_security_recommendation' in body;

  return (
    <div className="flex flex-col gap-2">
      {templateName && (
        <p className="text-xs text-gray-400 text-center font-mono">{templateName}</p>
      )}
      <div className="bg-[#e5ddd5] rounded-xl p-4">
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="p-3 space-y-1">
            {header && <HeaderPreview comp={header} />}

            {ltoComp && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 mb-2">
                <p className="text-xs font-semibold text-amber-800">
                  {(ltoComp.limited_time_offer as Comp | undefined)?.text as string || 'Limited-time offer'}
                </p>
                {Boolean((ltoComp.limited_time_offer as Comp | undefined)?.has_expiration) && (
                  <p className="text-xs text-amber-600">⏱ Offer expires in: 2 days 14 hrs</p>
                )}
              </div>
            )}

            {isAuth ? (
              <div className="text-sm text-gray-800 space-y-1">
                <p><strong>{'{{1}}'}</strong> is your verification code.</p>
                {Boolean(body.add_security_recommendation) && (
                  <p className="text-xs text-gray-500">For your security, do not share this code.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {body?.text
                  ? renderText(body.text as string)
                  : <span className="text-gray-400">Message body…</span>}
              </p>
            )}

            {carouselComp && (
              <div className="flex gap-2 overflow-x-auto pb-1 mt-2">
                {((carouselComp.cards as Comp[]) ?? []).map((card, i) => (
                  <CarouselCardPreview key={i} card={card} index={i} />
                ))}
              </div>
            )}

            {footer && !('code_expiration_minutes' in footer) && (
              <p className="text-xs text-gray-400 mt-1">{footer.text as string}</p>
            )}
            {footer && 'code_expiration_minutes' in footer && (
              <p className="text-xs text-gray-400 mt-1">This code expires in {footer.code_expiration_minutes as number} minutes.</p>
            )}

            <p className="text-xs text-gray-400 text-right">12:00 PM ✓✓</p>
          </div>

          {buttons.length > 0 && <ButtonsPreview buttons={buttons} />}
        </div>
      </div>
    </div>
  );
}
