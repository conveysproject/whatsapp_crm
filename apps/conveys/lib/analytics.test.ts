import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  trackCTAClick,
  trackPhoneClick,
  trackEmailClick,
  trackServiceCardClick,
  trackFormStart,
  trackFormError,
  trackFormAbandon,
  trackBlogScroll,
} from "./analytics";

describe("analytics", () => {
  let mockGtag: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGtag = vi.fn();
    vi.stubGlobal("window", { gtag: mockGtag });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("trackCTAClick", () => {
    it("includes page_section when provided", () => {
      trackCTAClick("Start a Project", "#contact", "hero");
      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        event_category: "engagement",
        event_label: "Start a Project",
        destination: "#contact",
        page_section: "hero",
      });
    });

    it("omits page_section when not provided", () => {
      trackCTAClick("Start a Project", "#contact");
      expect(mockGtag).toHaveBeenCalledWith("event", "cta_click", {
        event_category: "engagement",
        event_label: "Start a Project",
        destination: "#contact",
      });
    });
  });

  it("trackPhoneClick fires phone_click with location", () => {
    trackPhoneClick("homepage");
    expect(mockGtag).toHaveBeenCalledWith("event", "phone_click", {
      label: "phone",
      location: "homepage",
    });
  });

  it("trackEmailClick fires email_click with location", () => {
    trackEmailClick("footer");
    expect(mockGtag).toHaveBeenCalledWith("event", "email_click", {
      label: "email",
      location: "footer",
    });
  });

  it("trackServiceCardClick fires service_card_click", () => {
    trackServiceCardClick("Mobile App Development", "/services/mobile-app-development");
    expect(mockGtag).toHaveBeenCalledWith("event", "service_card_click", {
      service_name: "Mobile App Development",
      destination: "/services/mobile-app-development",
    });
  });

  it("trackFormStart fires contact_form_start with no params", () => {
    trackFormStart();
    expect(mockGtag).toHaveBeenCalledWith("event", "contact_form_start", undefined);
  });

  it("trackFormError fires contact_form_error with message", () => {
    trackFormError("Rate limit exceeded");
    expect(mockGtag).toHaveBeenCalledWith("event", "contact_form_error", {
      error_message: "Rate limit exceeded",
    });
  });

  it("trackFormAbandon fires contact_form_abandon with field and service", () => {
    trackFormAbandon("email", "Web & App Development");
    expect(mockGtag).toHaveBeenCalledWith("event", "contact_form_abandon", {
      last_field_touched: "email",
      service_selected: "Web & App Development",
    });
  });

  it("trackBlogScroll fires blog_scroll with milestone and post info", () => {
    trackBlogScroll(50, "saas-product-development-india", "SaaS Product Development India");
    expect(mockGtag).toHaveBeenCalledWith("event", "blog_scroll", {
      milestone: 50,
      post_slug: "saas-product-development-india",
      post_title: "SaaS Product Development India",
    });
  });
});
