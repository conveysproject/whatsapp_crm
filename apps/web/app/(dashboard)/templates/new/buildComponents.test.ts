import { describe, it, expect } from 'vitest';
import { buildComponents, extractVariables, validateForm } from './buildComponents';
import type { TemplateFormState } from './templateFormTypes';
import { INITIAL_STATE } from './templateFormTypes';

function state(overrides: Partial<TemplateFormState>): TemplateFormState {
  return { ...INITIAL_STATE, ...overrides };
}

describe('extractVariables', () => {
  it('extracts positional vars in order', () => {
    expect(extractVariables('Hi {{1}}, order {{2}}', 'positional')).toEqual(['{{1}}', '{{2}}']);
  });
  it('extracts named vars', () => {
    expect(extractVariables('Hi {{first_name}}', 'named')).toEqual(['{{first_name}}']);
  });
  it('deduplicates', () => {
    expect(extractVariables('{{1}} and {{1}}', 'positional')).toEqual(['{{1}}']);
  });
  it('returns empty for no vars', () => {
    expect(extractVariables('Hello world', 'positional')).toEqual([]);
  });
});

describe('buildComponents — authentication', () => {
  it('produces minimal auth components (no security, no expiry, copy_code)', () => {
    const result = buildComponents(state({ category: 'authentication' }));
    expect(result).toEqual([
      { type: 'body', add_security_recommendation: false },
      { type: 'buttons', buttons: [{ type: 'otp', otp_type: 'copy_code' }] },
    ]);
  });

  it('includes security recommendation when enabled', () => {
    const result = buildComponents(state({ category: 'authentication', addSecurityRecommendation: true }));
    const body = result.find((c: Record<string, unknown>) => c.type === 'body') as Record<string, unknown>;
    expect(body.add_security_recommendation).toBe(true);
  });

  it('includes footer with code_expiration_minutes when set', () => {
    const result = buildComponents(state({ category: 'authentication', codeExpirationMinutes: '10' }));
    expect(result).toContainEqual({ type: 'footer', code_expiration_minutes: 10 });
  });

  it('includes custom otp button text when provided', () => {
    const result = buildComponents(state({ category: 'authentication', otpButtonText: 'Copy OTP' }));
    const btn = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    const buttons = btn.buttons as Record<string, unknown>[];
    expect(buttons[0].text).toBe('Copy OTP');
  });
});

describe('buildComponents — standard marketing/utility', () => {
  it('produces body-only for minimal state', () => {
    const result = buildComponents(state({ bodyText: 'Hello world' }));
    expect(result).toContainEqual({ type: 'body', text: 'Hello world' });
    expect(result).not.toContainEqual(expect.objectContaining({ type: 'header' }));
    expect(result).not.toContainEqual(expect.objectContaining({ type: 'footer' }));
  });

  it('includes text header when set', () => {
    const result = buildComponents(state({ headerType: 'text', headerText: 'Sale!', bodyText: 'Body' }));
    expect(result).toContainEqual({ type: 'header', format: 'TEXT', text: 'Sale!' });
  });

  it('includes image header with example handle', () => {
    const result = buildComponents(state({ headerType: 'image', headerMediaUrl: 'https://x.com/img.jpg', bodyText: 'Body' }));
    expect(result).toContainEqual({
      type: 'header', format: 'IMAGE',
      example: { header_handle: ['https://x.com/img.jpg'] },
    });
  });

  it('includes footer when set', () => {
    const result = buildComponents(state({ bodyText: 'B', footerText: 'Footer' }));
    expect(result).toContainEqual({ type: 'footer', text: 'Footer' });
  });

  it('adds positional body example when vars present', () => {
    const result = buildComponents(state({
      bodyText: 'Hi {{1}}',
      parameterFormat: 'positional',
      variableExamples: { '{{1}}': 'John' },
    }));
    const body = result.find((c: Record<string, unknown>) => c.type === 'body') as Record<string, unknown>;
    expect(body.example).toEqual({ body_text: [['John']] });
  });

  it('adds named body example when vars present', () => {
    const result = buildComponents(state({
      bodyText: 'Hi {{first_name}}',
      parameterFormat: 'named',
      variableExamples: { '{{first_name}}': 'John' },
    }));
    const body = result.find((c: Record<string, unknown>) => c.type === 'body') as Record<string, unknown>;
    expect(body.example).toEqual({
      body_text_named_params: [{ param_name: 'first_name', example: 'John' }],
    });
  });

  it('includes quick_reply button', () => {
    const result = buildComponents(state({
      bodyText: 'B',
      buttons: [{ id: '1', type: 'quick_reply', text: 'Yes', url: '', urlIsDynamic: false, urlExample: '', phone: '', couponExample: '' }],
    }));
    const btnComp = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    expect((btnComp.buttons as Record<string, unknown>[])[0]).toEqual({ type: 'quick_reply', text: 'Yes' });
  });

  it('includes static url button', () => {
    const result = buildComponents(state({
      bodyText: 'B',
      buttons: [{ id: '1', type: 'url', text: 'Visit', url: 'https://example.com', urlIsDynamic: false, urlExample: '', phone: '', couponExample: '' }],
    }));
    const btnComp = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    expect((btnComp.buttons as Record<string, unknown>[])[0]).toEqual({ type: 'url', text: 'Visit', url: 'https://example.com' });
  });

  it('includes dynamic url button with example', () => {
    const result = buildComponents(state({
      bodyText: 'B',
      buttons: [{ id: '1', type: 'url', text: 'Track', url: 'https://example.com/{{1}}', urlIsDynamic: true, urlExample: 'https://example.com/abc', phone: '', couponExample: '' }],
    }));
    const btnComp = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    expect((btnComp.buttons as Record<string, unknown>[])[0]).toEqual({
      type: 'url', text: 'Track', url: 'https://example.com/{{1}}',
      example: ['https://example.com/abc'],
    });
  });

  it('includes phone_number button', () => {
    const result = buildComponents(state({
      bodyText: 'B',
      buttons: [{ id: '1', type: 'phone_number', text: 'Call', url: '', urlIsDynamic: false, urlExample: '', phone: '+15550001234', couponExample: '' }],
    }));
    const btnComp = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    expect((btnComp.buttons as Record<string, unknown>[])[0]).toEqual({ type: 'phone_number', text: 'Call', phone_number: '+15550001234' });
  });
});

describe('buildComponents — coupon', () => {
  it('produces body + copy_code button with example', () => {
    const result = buildComponents(state({
      subType: 'coupon',
      bodyText: 'Use {{1}} for discount',
      couponExampleCode: 'SAVE20',
    }));
    const btnComp = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    const buttons = btnComp.buttons as Record<string, unknown>[];
    expect(buttons.find((b) => b.type === 'copy_code')).toEqual({ type: 'copy_code', example: 'SAVE20' });
  });
});

describe('buildComponents — limited_time_offer', () => {
  it('produces header + lto component + body + buttons', () => {
    const result = buildComponents(state({
      subType: 'lto',
      headerType: 'image',
      headerMediaUrl: 'https://x.com/img.jpg',
      bodyText: 'Offer!',
      ltoText: 'Expires soon!',
      ltoHasExpiration: true,
      couponExampleCode: 'LTO25',
      buttons: [{ id: '1', type: 'url', text: 'Book', url: 'https://x.com', urlIsDynamic: false, urlExample: '', phone: '', couponExample: '' }],
    }));
    expect(result.find((c: Record<string, unknown>) => c.type === 'limited_time_offer')).toEqual({
      type: 'limited_time_offer',
      limited_time_offer: { text: 'Expires soon!', has_expiration: true },
    });
    const btnComp = result.find((c: Record<string, unknown>) => c.type === 'buttons') as Record<string, unknown>;
    const buttons = btnComp.buttons as Record<string, unknown>[];
    expect(buttons.find((b) => b.type === 'copy_code')).toEqual({ type: 'copy_code', example: 'LTO25' });
    expect(result.find((c: Record<string, unknown>) => c.type === 'footer')).toBeUndefined();
  });
});

describe('buildComponents — carousel', () => {
  it('produces body + carousel with cards', () => {
    const result = buildComponents(state({
      subType: 'carousel',
      bodyText: 'Check these out!',
      cards: [
        {
          id: '1', headerMediaUrl: 'https://x.com/1.jpg', bodyText: '',
          buttons: [{ id: 'b1', type: 'url', text: 'Shop', url: 'https://x.com/{{1}}', urlIsDynamic: true, urlExample: 'https://x.com/a', phone: '' }],
        },
        {
          id: '2', headerMediaUrl: 'https://x.com/2.jpg', bodyText: '',
          buttons: [{ id: 'b2', type: 'url', text: 'Shop', url: 'https://x.com/{{1}}', urlIsDynamic: true, urlExample: 'https://x.com/b', phone: '' }],
        },
      ],
    }));
    const carousel = result.find((c: Record<string, unknown>) => c.type === 'carousel') as Record<string, unknown>;
    expect(carousel).toBeDefined();
    const cards = carousel.cards as unknown[];
    expect(cards).toHaveLength(2);
  });
});

describe("validateForm — carousel validations", () => {
  const baseCard = (overrides: Partial<import("./templateFormTypes").CarouselCard> = {}): import("./templateFormTypes").CarouselCard => ({
    id: "c1",
    headerMediaUrl: "https://example.com/img.jpg",
    bodyText: "",
    buttons: [],
    ...overrides,
  });

  const baseState = (): import("./templateFormTypes").TemplateFormState => ({
    ...INITIAL_STATE,
    name: "test_template",
    category: "marketing",
    subType: "carousel",
    language: "en",
    headerType: "none",
    headerText: "",
    headerMediaUrl: "",
    bodyText: "Check these out",
    footerText: "",
    buttons: [],
    cards: [baseCard({ id: "c1" }), baseCard({ id: "c2" })],
  });

  it("errors when a card body exceeds 60 characters", () => {
    const state = baseState();
    state.cards[0]!.bodyText = "A".repeat(61);
    const errors = validateForm(state);
    expect(errors).toContain("Card 1 body text max 60 characters.");
  });

  it("allows card body of exactly 60 characters", () => {
    const state = baseState();
    state.cards[0]!.bodyText = "A".repeat(60);
    const errors = validateForm(state);
    expect(errors).not.toContain("Card 1 body text max 60 characters.");
  });

  it("errors when cards have different button counts", () => {
    const state = baseState();
    state.cards[0]!.buttons = [{ id: "b1", type: "quick_reply", text: "Yes", url: "", urlIsDynamic: false, urlExample: "", phone: "" }];
    state.cards[1]!.buttons = [];
    const errors = validateForm(state);
    expect(errors.some((e) => e.includes("same number of buttons"))).toBe(true);
  });

  it("errors when cards have different button types", () => {
    const state = baseState();
    const qr = { id: "b1", type: "quick_reply" as const, text: "Yes", url: "", urlIsDynamic: false, urlExample: "", phone: "" };
    const url = { id: "b2", type: "url" as const, text: "Learn More", url: "https://x.com", urlIsDynamic: false, urlExample: "", phone: "" };
    state.cards[0]!.buttons = [qr];
    state.cards[1]!.buttons = [url];
    const errors = validateForm(state);
    expect(errors.some((e) => e.includes("same type of buttons"))).toBe(true);
  });

  it("passes when all cards have the same button count and types", () => {
    const state = baseState();
    const qr = (id: string) => ({ id, type: "quick_reply" as const, text: "Yes", url: "", urlIsDynamic: false, urlExample: "", phone: "" });
    state.cards[0]!.buttons = [qr("b1")];
    state.cards[1]!.buttons = [qr("b2")];
    const errors = validateForm(state);
    expect(errors.filter((e) => e.includes("button"))).toEqual([]);
  });
});
