import { describe, it, expect, vi } from "vitest";

// Mock resend so the module-level singleton doesn't throw when RESEND_API_KEY is absent in tests.
vi.mock("resend", () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ data: {}, error: null }) },
  })),
}));

import { buildLeadNotificationEmail, buildAutoReplyEmail } from "./mail";

const data = {
  name: "Riya Shah",
  email: "riya@example.com",
  phone: "+91 98765 43210",
  service: "AI Solutions",
  message: "I need an AI chatbot for my e-commerce site.",
};

describe("buildLeadNotificationEmail", () => {
  it("generates a subject containing name and service", () => {
    const { subject } = buildLeadNotificationEmail(data);
    expect(subject).toContain("Riya Shah");
    expect(subject).toContain("AI Solutions");
  });

  it("generates html containing all submitted fields", () => {
    const { html } = buildLeadNotificationEmail(data);
    expect(html).toContain("Riya Shah");
    expect(html).toContain("riya@example.com");
    expect(html).toContain("+91 98765 43210");
    expect(html).toContain("AI Solutions");
    expect(html).toContain("I need an AI chatbot");
  });

  it("omits the phone row when phone is not provided", () => {
    const { html } = buildLeadNotificationEmail({ ...data, phone: undefined });
    expect(html).not.toContain("+91 98765 43210");
  });
});

describe("buildAutoReplyEmail", () => {
  it("generates a subject containing the visitor name", () => {
    const { subject } = buildAutoReplyEmail({ name: "Riya Shah", service: "AI Solutions" });
    expect(subject).toContain("Riya Shah");
  });

  it("generates html mentioning the service they enquired about", () => {
    const { html } = buildAutoReplyEmail({ name: "Riya Shah", service: "AI Solutions" });
    expect(html).toContain("AI Solutions");
  });

  it("includes Conveys contact info in the html", () => {
    const { html } = buildAutoReplyEmail({ name: "Riya", service: "AI Solutions" });
    expect(html).toContain("info@conveys.in");
    expect(html).toContain("+91 99070 72035");
  });
});
