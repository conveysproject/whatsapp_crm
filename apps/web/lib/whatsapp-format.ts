// GAP-S22: WhatsApp text markdown → safe HTML
// Handles: *bold*, _italic_, ~strikethrough~, ```monospace```, line breaks
export function formatWhatsAppText(text: string): string {
  // Escape HTML entities first to prevent XSS
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (triple backtick) — process before single backtick
  html = html.replace(/```([\s\S]*?)```/g, "<code>$1</code>");
  // Bold
  html = html.replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
  // Italic
  html = html.replace(/_([^_\n]+)_/g, "<i>$1</i>");
  // Strikethrough
  html = html.replace(/~([^~\n]+)~/g, "<s>$1</s>");
  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}
