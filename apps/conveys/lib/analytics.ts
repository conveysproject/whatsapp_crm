declare global {
  // eslint-disable-next-line no-var
  var gtag: ((...args: unknown[]) => void) | undefined;
  // eslint-disable-next-line no-var
  var clarity: ((...args: unknown[]) => void) | undefined;
}

export function trackEvent(event: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (typeof window.gtag === "function") {
    window.gtag("event", event, params);
  }
}

export function trackLead(service?: string): void {
  trackEvent("generate_lead", {
    event_category: "contact",
    event_label: service ?? "general",
  });
}

export function trackCTAClick(label: string, destination: string): void {
  trackEvent("cta_click", {
    event_category: "engagement",
    event_label: label,
    destination,
  });
}
