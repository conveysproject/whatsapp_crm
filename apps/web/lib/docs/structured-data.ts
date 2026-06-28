import type { DocArticle, DocCategory } from "./types";

const BASE = "https://wbmsg.com";

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "WBMSG",
    url: BASE,
    description:
      "WBMSG is a WhatsApp-first CRM for small and medium businesses. Manage shared team inboxes, contacts, broadcast campaigns, and automation — all via the official Meta WhatsApp Business API.",
    sameAs: [],
  };
}

export function breadcrumbSchema(
  cat: DocCategory,
  art?: DocArticle
) {
  const items: Array<{ "@type": string; position: number; name: string; item: string }> = [
    { "@type": "ListItem", position: 1, name: "Help Center", item: `${BASE}/docs` },
    { "@type": "ListItem", position: 2, name: cat.title, item: `${BASE}/docs/${cat.slug}` },
  ];
  if (art) {
    items.push({
      "@type": "ListItem",
      position: 3,
      name: art.title,
      item: `${BASE}/docs/${cat.slug}/${art.slug}`,
    });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function articleSchema(art: DocArticle, cat: DocCategory) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: art.title,
    description: art.description,
    url: `${BASE}/docs/${cat.slug}/${art.slug}`,
    inLanguage: "en",
    publisher: {
      "@type": "Organization",
      name: "WBMSG",
      url: BASE,
    },
    isPartOf: {
      "@type": "WebSite",
      name: "WBMSG Help Center",
      url: `${BASE}/docs`,
    },
  };
}

export function howToSchema(art: DocArticle) {
  const steps = art.sections.flatMap((s) => s.steps ?? []);
  if (!steps.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: art.title,
    description: art.description,
    step: steps.map((text, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      text,
    })),
  };
}

export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "WBMSG Help Center",
    url: `${BASE}/docs`,
    description:
      "Documentation and guides for WBMSG — the WhatsApp-first CRM. Covers inbox, contacts, campaigns, automation, analytics, and more.",
    publisher: {
      "@type": "Organization",
      name: "WBMSG",
      url: BASE,
    },
  };
}
