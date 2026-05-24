import type { WaTemplateComponent } from "./whatsapp.js";

interface StoredCardComponent {
  type?: string;
  format?: string;
  text?: string;
  example?: { header_handle?: string[]; header_text?: string[]; body_text?: string[][] };
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string; example?: string[] }>;
}

interface StoredComponent {
  type?: string;
  format?: string;
  text?: string;
  example?: {
    header_text?: string[];   // TEXT header variable example values
    header_url?: string[];    // IMAGE/VIDEO/DOCUMENT header example URL (non-carousel)
    body_text?: string[][];   // body variable example values
  };
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string; example?: string[] }>;
  cards?: Array<{ components?: StoredCardComponent[] }>;
}

/** Count distinct {{n}} placeholders in a string. */
function countVars(text: string): number {
  const matches = text.match(/\{\{\d+\}\}/g);
  if (!matches) return 0;
  return new Set(matches).size;
}

/**
 * Build the Meta API `components` array for a template send.
 *
 * Rules (per Meta Cloud API docs):
 *  - Only include a component when its stored definition actually contains variables.
 *  - Number of parameters must exactly match the number of distinct {{n}} placeholders.
 *  - For HEADER IMAGE/VIDEO/DOCUMENT — caller must supply a mediaId; omit if not provided.
 *  - For URL buttons with {{1}} — include a button sub-component per dynamic suffix.
 *  - For QUICK_REPLY buttons — include a button sub-component with payload per button.
 *
 * @param stored   The `components` JSON array stored on the Template row (from Meta sync).
 * @param vars     Variable values to substitute, keyed by component type.
 */
export function buildTemplateComponents(
  stored: unknown[],
  vars: {
    header?: string[];       // text values for HEADER TEXT variables
    headerMediaId?: string;  // media ID for HEADER IMAGE/VIDEO/DOCUMENT
    body?: string[];         // text values for BODY variables  {{1}}, {{2}} …
    buttons?: string[];      // dynamic suffix for URL buttons, or payload for QUICK_REPLY
    cards?: Array<{          // per-card overrides for carousel templates
      headerMediaId?: string;
      headerMediaUrl?: string; // publicly accessible URL for IMAGE/VIDEO/DOCUMENT header
      body?: string[];
      buttons?: string[];
    }>;
  } = {}
): WaTemplateComponent[] {
  const components = stored as StoredComponent[];
  const result: WaTemplateComponent[] = [];

  for (const comp of components) {
    const type = (comp.type ?? "").toUpperCase();

    if (type === "HEADER") {
      const format = (comp.format ?? "TEXT").toUpperCase();

      if (format === "TEXT" && comp.text) {
        const varCount = countVars(comp.text);
        if (varCount > 0) {
          const callerVals = (vars.header ?? []).slice(0, varCount);
          const exampleVals = comp.example?.header_text ?? [];
          const params = Array.from({ length: varCount }, (_, i) =>
            callerVals[i] ?? exampleVals[i] ?? ""
          );
          // Skip if any parameter is empty — Meta rejects empty string values
          if (params.every((p) => p !== "")) {
            result.push({
              type: "header",
              parameters: params.map((t) => ({ type: "text" as const, text: t })),
            });
          }
        }
        // Static text header → no component needed
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        const mediaType = format.toLowerCase() as "image" | "video" | "document";
        if (vars.headerMediaId) {
          result.push({
            type: "header",
            parameters: [{ type: mediaType, [mediaType]: { id: vars.headerMediaId } } as never],
          });
        } else if (comp.example?.header_url?.[0]) {
          // Fall back to the example URL stored in the template definition.
          // Meta's API accepts { link: url } for IMAGE/VIDEO/DOCUMENT header parameters.
          result.push({
            type: "header",
            parameters: [{ type: mediaType, [mediaType]: { link: comp.example.header_url[0] } } as never],
          });
        }
        // No media at all → omit; Meta will error if the header is variable, accept if static
      }

    } else if (type === "BODY") {
      if (comp.text) {
        const varCount = countVars(comp.text);
        if (varCount > 0) {
          const callerVals = (vars.body ?? []).slice(0, varCount);
          const exampleVals = comp.example?.body_text?.[0] ?? [];
          const params = Array.from({ length: varCount }, (_, i) =>
            callerVals[i] ?? exampleVals[i] ?? ""
          );
          // Skip if any parameter is empty — Meta rejects empty string values
          if (params.every((p) => p !== "")) {
            result.push({
              type: "body",
              parameters: params.map((t) => ({ type: "text" as const, text: t })),
            });
          }
        }
        // Static body → no component needed
      }

    } else if (type === "BUTTONS") {
      const buttons = comp.buttons ?? [];
      buttons.forEach((btn, idx) => {
        const btnType = (btn.type ?? "").toUpperCase();

        if (btnType === "URL") {
          // Dynamic URL suffix: url contains {{1}}
          const hasDynamic = btn.url?.includes("{{1}}") || (btn.example && btn.example.length > 0);
          if (hasDynamic && vars.buttons?.[idx] !== undefined) {
            result.push({
              type: "button",
              sub_type: "url",
              index: idx,
              parameters: [{ type: "text" as const, text: vars.buttons[idx]! }],
            });
          }
        } else if (btnType === "QUICK_REPLY") {
          if (vars.buttons?.[idx] !== undefined) {
            result.push({
              type: "button",
              sub_type: "quick_reply",
              index: idx,
              parameters: [{ type: "payload" as never, payload: vars.buttons[idx]! } as never],
            });
          }
        }
        // PHONE_NUMBER / COPY_CODE / VOICE_CALL → static, no parameters needed
      });

    } else if (type === "CAROUSEL") {
      const rawCards = comp.cards ?? [];
      const builtCards = rawCards.map((card, cardIndex) => {
        const cardComps: WaTemplateComponent[] = [];
        const cardVars = vars.cards?.[cardIndex];

        for (const cc of (card.components ?? [])) {
          const ccType = (cc.type ?? "").toUpperCase();
          const ccFormat = (cc.format ?? "IMAGE").toUpperCase();

          if (ccType === "HEADER" && ["IMAGE", "VIDEO", "DOCUMENT"].includes(ccFormat)) {
            const mediaType = ccFormat.toLowerCase() as "image" | "video" | "document";
            const mediaId = cardVars?.headerMediaId;
            const mediaUrl = cardVars?.headerMediaUrl;
            if (mediaId) {
              cardComps.push({
                type: "header",
                parameters: [{ type: mediaType, [mediaType]: { id: mediaId } } as never],
              });
            } else if (mediaUrl) {
              cardComps.push({
                type: "header",
                parameters: [{ type: mediaType, [mediaType]: { link: mediaUrl } } as never],
              });
            }
            // No media → omit; caller must supply mediaId or mediaUrl for carousel image cards
          } else if (ccType === "BODY" && cc.text) {
            const varCount = countVars(cc.text);
            if (varCount > 0) {
              const callerVals = cardVars?.body ?? [];
              const exampleVals = cc.example?.body_text?.[0] ?? [];
              const params = Array.from({ length: varCount }, (_, i) =>
                callerVals[i] ?? exampleVals[i] ?? ""
              );
              if (params.every((p) => p !== "")) {
                cardComps.push({
                  type: "body",
                  parameters: params.map((t) => ({ type: "text" as const, text: t })),
                });
              }
            }
          } else if (ccType === "BUTTONS") {
            (cc.buttons ?? []).forEach((btn, idx) => {
              const btnType = (btn.type ?? "").toUpperCase();
              const cardBtnVals = cardVars?.buttons ?? [];
              if (btnType === "URL") {
                const hasDynamic = btn.url?.includes("{{1}}") || (btn.example && btn.example.length > 0);
                if (hasDynamic && cardBtnVals[idx] !== undefined) {
                  cardComps.push({ type: "button", sub_type: "url", index: idx, parameters: [{ type: "text" as const, text: cardBtnVals[idx]! }] });
                }
              } else if (btnType === "QUICK_REPLY" && cardBtnVals[idx] !== undefined) {
                cardComps.push({ type: "button", sub_type: "quick_reply", index: idx, parameters: [{ type: "payload" as never, payload: cardBtnVals[idx]! } as never] });
              }
            });
          }
        }

        return { card_index: cardIndex, components: cardComps };
      });

      // Only include cards that have dynamic parameters. Meta requires non-empty
      // components arrays, so cards with no variables must be omitted.
      // If ALL cards are static, omit the carousel entirely — Meta renders the
      // template's own stored media, the same way static non-carousel templates work.
      const dynamicCards = builtCards.filter((card) => card.components.length > 0);
      if (dynamicCards.length > 0) {
        result.push({ type: "carousel", cards: dynamicCards });
      }
    }
    // FOOTER → always static, never needs parameters
  }

  return result;
}

/**
 * Convenience: derive body variable values from a contact for personalised sends.
 * Maps {{1}} → full name, {{2}} → phone, {{3}} → email.
 */
export function contactBodyVars(contact: {
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber: string;
  email?: string | null;
}, varCount: number): string[] {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.phoneNumber;
  const pool = [name, contact.phoneNumber, contact.email ?? ""];
  return Array.from({ length: varCount }, (_, i) => pool[i] ?? "");
}
