// next-style-loader inserts global CSS before this marker element (normally rendered by the Next.js document).
// Import this module BEFORE any global stylesheet in a component spec so Tailwind classes apply.
if (!document.querySelector('#__next_css__DO_NOT_USE__')) {
  const marker = document.createElement('meta');
  marker.id = '__next_css__DO_NOT_USE__';
  document.head.appendChild(marker);
}
export {};
