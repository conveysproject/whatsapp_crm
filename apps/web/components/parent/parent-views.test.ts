import { describe, it, expect } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChildrenTable } from "./ChildrenTable";
import { ClientAcceptView } from "./ClientAcceptView";
import { InviteClientForm } from "./InviteClientForm";
import { ParentLinkCardView } from "./ParentLinkCardView";
import { FULL_READ_ACCESS_SENTENCE } from "@/lib/parent-orgs";

const noop = () => undefined;
const child = (orgId: string, name: string, over: Record<string, unknown> = {}) => ({
  orgId, name, sent: 1200, delivered: 1100, read: 800, failed: 100, received: 300,
  failureRate: 0.077, lastActivityAt: "2026-10-19T10:30:00.000Z", wabaConnected: true, ...over,
});

describe("ChildrenTable", () => {
  const html = renderToStaticMarkup(
    h(ChildrenTable, {
      rows: [child("c1", "Alpha Ltd"), child("c2", "Beta Co", { wabaConnected: false, lastActivityAt: null, failureRate: 0 })],
      totals: { sent: 2400, delivered: 2200, read: 1600, failed: 200, received: 600 },
      busyId: null, onOpen: noop, onOpenAsAdmin: noop,
    }),
  );
  it("renders a row per client with its numbers", () => {
    expect(html).toContain("Alpha Ltd");
    expect(html).toContain("Beta Co");
    expect(html).toContain("1,200");
    expect(html).toContain("7.7%");
    expect(html).toContain("No activity");
  });
  it("shows WhatsApp connected yes / no", () => {
    expect(html).toContain("<td class=\"px-3 py-2\">Yes</td>");
    expect(html).toContain("<td class=\"px-3 py-2\">No</td>");
  });
  it("has a totals row and an Open as admin button per client", () => {
    expect(html).toContain("Total");
    expect(html).toContain("2,400");
    expect(html.match(/Open as admin/g)).toHaveLength(2);
  });
});

describe("InviteClientForm", () => {
  it("asks for an email and states the full-read-access sentence", () => {
    const html = renderToStaticMarkup(h(InviteClientForm, { busy: false, error: null, sentTo: null, onSubmit: noop, onClose: noop }));
    expect(html).toContain('type="email"');
    expect(html).toContain(FULL_READ_ACCESS_SENTENCE);
    expect(html).toContain("full read access");
  });
  it("confirms once sent and shows errors", () => {
    expect(renderToStaticMarkup(h(InviteClientForm, { busy: false, error: null, sentTo: "a@b.io", onSubmit: noop, onClose: noop }))).toContain("Invitation created for a@b.io");
    expect(renderToStaticMarkup(h(InviteClientForm, { busy: false, error: "Nope", sentTo: null, onSubmit: noop, onClose: noop }))).toContain("Nope");
  });
});

describe("ClientAcceptView", () => {
  const meta = { parentName: "Acme Agency", email: "me@client.io" };
  const base = { meta, busy: false, error: null, redirectPath: "/client-invitations/tk/accept", onSubmit: noop };
  it("names the inviter and states the full read access plainly", () => {
    const html = renderToStaticMarkup(h(ClientAcceptView, { ...base, signedIn: true }));
    expect(html).toContain("Acme Agency invited you to WBMSG");
    expect(html).toContain(FULL_READ_ACCESS_SENTENCE);
    expect(html).toContain("can open it as an admin");
  });
  it("signed in: asks for full name, organization name and an optional mobile", () => {
    const html = renderToStaticMarkup(h(ClientAcceptView, { ...base, signedIn: true }));
    expect(html).toContain("Your full name");
    expect(html).toContain("Organization name");
    expect(html).toContain("Mobile number (optional)");
  });
  it("signed out: sends the person to sign in and back to this page", () => {
    const html = renderToStaticMarkup(h(ClientAcceptView, { ...base, signedIn: false }));
    expect(html).toContain("/sign-in?redirect_url=%2Fclient-invitations%2Ftk%2Faccept");
    expect(html).not.toContain("Organization name");
    expect(html).toContain(FULL_READ_ACCESS_SENTENCE);
  });
});

describe("ParentLinkCardView", () => {
  const sessions = [
    { id: "s1", startedAt: "2026-10-18T09:00:00.000Z", endedAt: null, mode: "readonly", actorName: "Sam Parent" },
    { id: "s2", startedAt: "2026-10-17T09:00:00.000Z", endedAt: "2026-10-17T09:10:00.000Z", mode: "edit", actorName: "Pat Parent" },
  ];
  const props = { parentName: "Acme Agency", sessions, gate: "idle" as const, error: null, onLeave: noop, onConfirm: noop, onCancel: noop };
  it("shows the parent name, the access statement and the session list", () => {
    const html = renderToStaticMarkup(h(ParentLinkCardView, props));
    expect(html).toContain("Linked to Acme Agency");
    expect(html).toContain("full read access");
    expect(html).toContain("Sam Parent");
    expect(html).toContain("Pat Parent");
    expect(html).toContain("Read-only");
    expect(html).toContain("Edit");
    expect(html).toContain("New");
  });
  it("shows an empty state without sessions", () => {
    expect(renderToStaticMarkup(h(ParentLinkCardView, { ...props, sessions: [] }))).toContain("No sessions yet.");
  });
  it("Leave shows a confirmation only after it is requested", () => {
    expect(renderToStaticMarkup(h(ParentLinkCardView, props))).not.toContain('role="dialog"');
    const confirming = renderToStaticMarkup(h(ParentLinkCardView, { ...props, gate: "confirming" }));
    expect(confirming).toContain('role="dialog"');
    expect(confirming).toContain("Leave Acme Agency?");
  });
});
