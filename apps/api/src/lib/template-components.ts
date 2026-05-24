import type { WaTemplateComponent } from "./whatsapp.js";

interface StoredComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; text?: string; url?: string; phone_number?: string; example?: string[] }>;
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
          const params = (vars.header ?? []).slice(0, varCount);
          // Pad with empty string if caller didn't supply enough values
          while (params.length < varCount) params.push("");
          result.push({
            type: "header",
            parameters: params.map((t) => ({ type: "text" as const, text: t })),
          });
        }
        // Static text header → no component needed
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
        if (vars.headerMediaId) {
          const mediaType = format.toLowerCase() as "image" | "video" | "document";
          result.push({
            type: "header",
            parameters: [{ type: mediaType, [mediaType]: { id: vars.headerMediaId } } as never],
          });
        }
        // No media provided → skip header (will fail if template requires it, but safer than wrong param)
      }

    } else if (type === "BODY") {
      if (comp.text) {
        const varCount = countVars(comp.text);
        if (varCount > 0) {
          const params = (vars.body ?? []).slice(0, varCount);
          while (params.length < varCount) params.push("");
          result.push({
            type: "body",
            parameters: params.map((t) => ({ type: "text" as const, text: t })),
          });
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
