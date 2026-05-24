import type { TemplateFormState, ButtonDef, CarouselCard, CarouselButtonDef } from './templateFormTypes';

export function extractVariables(text: string, format: 'positional' | 'named'): string[] {
  const pattern = format === 'positional'
    ? /\{\{(\d+)\}\}/g
    : /\{\{([a-z][a-z0-9_]*)\}\}/g;
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) matches.add(m[0]);
  if (format === 'positional') {
    return [...matches].sort((a, b) => parseInt(a.slice(2, -2)) - parseInt(b.slice(2, -2)));
  }
  return [...matches];
}

function buildBodyExample(text: string, format: 'positional' | 'named', examples: Record<string, string>): Record<string, unknown> | undefined {
  const vars = extractVariables(text, format);
  if (vars.length === 0) return undefined;
  if (format === 'positional') {
    return { body_text: [vars.map((v) => examples[v] ?? '')] };
  }
  return {
    body_text_named_params: vars.map((v) => ({
      param_name: v.slice(2, -2),
      example: examples[v] ?? '',
    })),
  };
}

function buildButton(btn: ButtonDef): Record<string, unknown> {
  if (btn.type === 'quick_reply') return { type: 'quick_reply', text: btn.text };
  if (btn.type === 'phone_number') return { type: 'phone_number', text: btn.text, phone_number: btn.phone };
  if (btn.type === 'copy_code') return { type: 'copy_code', example: btn.couponExample };
  const base: Record<string, unknown> = { type: 'url', text: btn.text, url: btn.url };
  if (btn.urlIsDynamic && btn.urlExample) base.example = [btn.urlExample];
  return base;
}

function buildCarouselButton(btn: CarouselButtonDef): Record<string, unknown> {
  if (btn.type === 'quick_reply') return { type: 'quick_reply', text: btn.text };
  if (btn.type === 'phone_number') return { type: 'phone_number', text: btn.text, phone_number: btn.phone };
  const base: Record<string, unknown> = { type: 'url', text: btn.text, url: btn.url };
  if (btn.urlIsDynamic && btn.urlExample) base.example = [btn.urlExample];
  return base;
}

function buildHeaderComponent(state: TemplateFormState): Record<string, unknown> | null {
  if (state.headerType === 'none') return null;
  if (state.headerType === 'text') {
    const comp: Record<string, unknown> = { type: 'header', format: 'TEXT', text: state.headerText };
    const vars = extractVariables(state.headerText, state.parameterFormat);
    if (vars.length > 0) comp.example = { header_text: [state.variableExamples[vars[0]] ?? ''] };
    return comp;
  }
  if (state.headerType === 'location') return { type: 'header', format: 'LOCATION' };
  const format = state.headerType.toUpperCase();
  return {
    type: 'header', format,
    example: { header_handle: [state.headerMediaUrl] },
  };
}

function buildAuthComponents(state: TemplateFormState): object[] {
  const comps: Record<string, unknown>[] = [];
  comps.push({ type: 'body', add_security_recommendation: state.addSecurityRecommendation });
  if (state.codeExpirationMinutes !== '') {
    comps.push({ type: 'footer', code_expiration_minutes: parseInt(state.codeExpirationMinutes) });
  }
  const otpBtn: Record<string, unknown> = { type: 'otp', otp_type: state.otpType };
  if (state.otpButtonText) otpBtn.text = state.otpButtonText;
  comps.push({ type: 'buttons', buttons: [otpBtn] });
  return comps;
}

function buildStandardComponents(state: TemplateFormState): object[] {
  const comps: Record<string, unknown>[] = [];
  const header = buildHeaderComponent(state);
  if (header) comps.push(header);
  const bodyExample = buildBodyExample(state.bodyText, state.parameterFormat, state.variableExamples);
  const body: Record<string, unknown> = { type: 'body', text: state.bodyText };
  if (bodyExample) body.example = bodyExample;
  comps.push(body);
  if (state.footerText) comps.push({ type: 'footer', text: state.footerText });
  if (state.buttons.length > 0) {
    comps.push({ type: 'buttons', buttons: state.buttons.map(buildButton) });
  }
  return comps;
}

function buildCouponComponents(state: TemplateFormState): object[] {
  const comps: Record<string, unknown>[] = [];
  const header = buildHeaderComponent(state);
  if (header) comps.push(header);
  const bodyExample = buildBodyExample(state.bodyText, state.parameterFormat, state.variableExamples);
  const body: Record<string, unknown> = { type: 'body', text: state.bodyText };
  if (bodyExample) body.example = bodyExample;
  comps.push(body);
  const buttons: Record<string, unknown>[] = state.buttons
    .filter((b) => b.type === 'quick_reply')
    .map(buildButton);
  buttons.push({ type: 'copy_code', example: state.couponExampleCode });
  comps.push({ type: 'buttons', buttons });
  return comps;
}

function buildLtoComponents(state: TemplateFormState): object[] {
  const comps: Record<string, unknown>[] = [];
  const header = buildHeaderComponent(state);
  if (header) comps.push(header);
  comps.push({ type: 'limited_time_offer', limited_time_offer: { text: state.ltoText, has_expiration: state.ltoHasExpiration } });
  const bodyExample = buildBodyExample(state.bodyText, state.parameterFormat, state.variableExamples);
  const body: Record<string, unknown> = { type: 'body', text: state.bodyText };
  if (bodyExample) body.example = bodyExample;
  comps.push(body);
  const buttons: Record<string, unknown>[] = [{ type: 'copy_code', example: state.couponExampleCode }];
  const urlBtns = state.buttons.filter((b) => b.type === 'url').map(buildButton);
  buttons.push(...urlBtns);
  comps.push({ type: 'buttons', buttons });
  return comps;
}

function buildCarouselComponents(state: TemplateFormState): object[] {
  const bodyExample = buildBodyExample(state.bodyText, state.parameterFormat, state.variableExamples);
  const body: Record<string, unknown> = { type: 'body', text: state.bodyText };
  if (bodyExample) body.example = bodyExample;
  const cards = state.cards.map((card: CarouselCard) => {
    const cardComps: Record<string, unknown>[] = [
      { type: 'header', format: 'IMAGE', example: { header_handle: [card.headerMediaUrl] } },
    ];
    if (card.bodyText) {
      cardComps.push({ type: 'body', text: card.bodyText });
    }
    if (card.buttons.length > 0) {
      cardComps.push({ type: 'buttons', buttons: card.buttons.map(buildCarouselButton) });
    }
    return { components: cardComps };
  });
  return [body, { type: 'carousel', cards }];
}

export function buildComponents(state: TemplateFormState): object[] {
  if (state.category === 'authentication') return buildAuthComponents(state);
  if (state.subType === 'carousel') return buildCarouselComponents(state);
  if (state.subType === 'lto') return buildLtoComponents(state);
  if (state.subType === 'coupon') return buildCouponComponents(state);
  return buildStandardComponents(state);
}

export function validateForm(state: TemplateFormState): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9_]{1,512}$/.test(state.name)) errors.push('Template name must be lowercase letters, numbers, and underscores only.');
  if (state.category !== 'authentication' && !state.bodyText.trim()) errors.push('Body text is required.');
  if (state.headerType === 'text' && state.headerText.length > 60) errors.push('Header text max 60 characters.');
  if (state.footerText.length > 60) errors.push('Footer text max 60 characters.');
  if (state.subType === 'lto' && state.bodyText.length > 600) errors.push('LTO body text max 600 characters.');
  else if (state.bodyText.length > 1024) errors.push('Body text max 1024 characters.');
  if (state.subType === 'lto' && state.ltoText.length > 16) errors.push('LTO offer text max 16 characters.');
  if (state.subType === 'carousel' && (state.cards.length < 2 || state.cards.length > 10)) errors.push('Carousel must have 2–10 cards.');
  for (const btn of state.buttons) {
    if (btn.text.length > 25) errors.push(`Button "${btn.text}" label max 25 characters.`);
    if (btn.type === 'url' && btn.url.length > 2000) errors.push('URL button URL max 2000 characters.');
    if (btn.type === 'phone_number' && btn.phone.length > 20) errors.push('Phone number max 20 characters.');
  }
  return errors;
}
