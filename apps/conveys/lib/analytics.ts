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

export function trackCTAClick(label: string, destination: string, pageSection?: string): void {
  trackEvent("cta_click", {
    event_category: "engagement",
    event_label: label,
    destination,
    ...(pageSection !== undefined ? { page_section: pageSection } : {}),
  });
}

export function trackPhoneClick(location: string): void {
  trackEvent("phone_click", { label: "phone", location });
}

export function trackEmailClick(location: string): void {
  trackEvent("email_click", { label: "email", location });
}

export function trackServiceCardClick(serviceName: string, destination: string): void {
  trackEvent("service_card_click", { service_name: serviceName, destination });
}

export function trackFormStart(): void {
  trackEvent("contact_form_start");
}

export function trackFormError(errorMessage: string): void {
  trackEvent("contact_form_error", { error_message: errorMessage });
}

export function trackFormAbandon(lastField: string, serviceSelected?: string): void {
  trackEvent("contact_form_abandon", {
    last_field_touched: lastField,
    ...(serviceSelected ? { service_selected: serviceSelected } : {}),
  });
}

export function trackBlogScroll(milestone: number, postSlug: string, postTitle: string): void {
  trackEvent("blog_scroll", { milestone, post_slug: postSlug, post_title: postTitle });
}
