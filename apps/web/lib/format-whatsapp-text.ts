// GAP-S22: WhatsApp markdown → HTML conversion, matching WhatsJet's formatWhatsAppText()
export function formatWhatsAppText(text: string): string {
  let result = text
    // Escape HTML entities first (before we insert real tags)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Triple backtick code blocks (must come before single backtick)
  result = result.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");

  // Inline code (single backtick)
  result = result.replace(/`([^`]+)`/g, '<code class="wa-inline-code">$1</code>');

  // Bold: *text*
  result = result.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");

  // Italic: _text_
  result = result.replace(/_([^_\n]+)_/g, "<em>$1</em>");

  // Strikethrough: ~text~
  result = result.replace(/~([^~\n]+)~/g, "<s>$1</s>");

  // URLs → hyperlinks (must not double-wrap already-linked text)
  result = result.replace(
    /(?<!href=["'])(?<!\w)(https?:\/\/[^\s<>"]+)/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );

  // Newlines → <br>
  result = result.replace(/\n/g, "<br />");

  return result;
}
