# Deal Interactive Message — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace plain-text deal notifications with WhatsApp interactive button messages (Accept / Reject / Negotiate), adding a preview card in DealSlideOver before send and a server-side guarantee that the message always appears in the agent inbox.

**Architecture:** Two file changes only. `messages.ts` adds one explicit `isSystemMessage: false` to the draft creation for interactive messages. `DealSlideOver.tsx` removes the editable text message flow and replaces it with a read-only preview card that builds the interactive payload on save. No new endpoints, no schema changes.

**Tech Stack:** React (Next.js 15 App Router), Tailwind CSS, Fastify 4, Prisma, Vitest

---

### Task 1: Server guard — isSystemMessage: false for interactive messages

**Files:**
- Modify: `apps/api/src/routes/messages.ts` (around line 257)
- Test: `apps/api/src/routes/messages.test.ts`

- [ ] **Step 1: Write the failing test**

Append this `describe` block at the bottom of `apps/api/src/routes/messages.test.ts`:

```typescript
describe("POST /v1/conversations/:id/messages — interactive isSystemMessage guard", () => {
  let app: FastifyInstance;
  beforeEach(async () => { vi.resetModules(); vi.clearAllMocks(); app = await buildApp(); });
  afterEach(async () => { await app.close(); });

  it("creates message draft with isSystemMessage: false for interactive messages", async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue(baseConversation);
    mockPrisma.message.create.mockResolvedValue({ id: "msg-int-1", status: "sending" });
    mockPrisma.message.update.mockResolvedValue({
      id: "msg-int-1", contentType: "interactive", direction: "outbound",
      status: "sent", isSystemMessage: false,
    });
    mockPrisma.conversation.update.mockResolvedValue({});

    await app.inject({
      method: "POST",
      url: "/v1/conversations/conv-1/messages",
      headers: { "content-type": "application/json" },
      payload: {
        contentType: "interactive",
        interactive: {
          type: "button",
          header: { type: "text", text: "Deal: Test Deal" },
          body: { text: "Value: 25000\n\nSome notes" },
          footer: { text: "Reply using the buttons below" },
          action: {
            buttons: [
              { type: "reply", reply: { id: "deal_accept_abc123", title: "✓ Accept" } },
              { type: "reply", reply: { id: "deal_reject_abc123", title: "✗ Reject" } },
              { type: "reply", reply: { id: "deal_negotiate_abc123", title: "~ Negotiate" } },
            ],
          },
        },
      },
    });

    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isSystemMessage: false }),
      })
    );
  });
});
```

- [ ] **Step 2: Run test — verify it FAILS**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose messages.test.ts
```

Expected: FAIL on the new test — `isSystemMessage: false` not present in `message.create` call.

- [ ] **Step 3: Add the guard in messages.ts**

In `apps/api/src/routes/messages.ts`, find the non-template draft creation block (around line 257). It currently reads:

```typescript
      const draft = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType,
          body: storedBody,
          status: "sending",
        },
      });
```

Replace with:

```typescript
      const draft = await fastify.prisma.message.create({
        data: {
          conversationId: conversation.id,
          organizationId,
          direction: "outbound",
          contentType,
          body: storedBody,
          status: "sending",
          ...(contentType === "interactive" ? { isSystemMessage: false } : {}),
        },
      });
```

- [ ] **Step 4: Run test — verify it PASSES**

```bash
pnpm --filter @WBMSG/api test -- --reporter=verbose messages.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/messages.ts apps/api/src/routes/messages.test.ts
git commit -m "feat(messages): enforce isSystemMessage: false for interactive messages"
```

---

### Task 2: DealSlideOver — replace text notify with interactive preview

**Files:**
- Modify: `apps/web/components/deals/DealSlideOver.tsx`

(No automated test — React component with no existing test file. Verify manually in Task 3.)

- [ ] **Step 1: Remove notifyMessage state and its useEffect**

In `apps/web/components/deals/DealSlideOver.tsx`:

**Remove line 32** (the `notifyMessage` state):
```typescript
  const [notifyMessage, setNotifyMessage] = useState("");
```

**Remove lines 46–53** (the entire `useEffect` that builds the text message):
```typescript
  // Build default notify message whenever value or stage changes
  useEffect(() => {
    if (!notifyContact) return;
    const name = contactName ?? "there";
    const valuePart = value
      ? `The updated price is ${parseFloat(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.`
      : "";
    setNotifyMessage(`Hi ${name}, we've updated your deal "${title}". ${valuePart} Please let us know if you have any questions!`.trim());
  }, [notifyContact, value, stage, title]);
```

**Remove `setNotifyMessage("")`** from inside the `deal` useEffect (currently line 42 after the removals above):
```typescript
    setNotifyMessage("");
```

- [ ] **Step 2: Replace handleSave**

Replace the entire `handleSave` function (lines 55–102) with:

```typescript
  async function handleSave(sendNotification = true) {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    const token = await getToken();

    const res = await fetch(`${api}/v1/deals/${deal.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        value: value ? parseFloat(value) : null,
        stage,
        notes: notes.trim() || null,
      }),
    });

    if (!res.ok) {
      setSaving(false);
      setError("Failed to save. Please try again.");
      return;
    }

    if (sendNotification && notifyContact && deal.contact && notes.trim()) {
      const convRes = await fetch(`${api}/v1/conversations?contactId=${deal.contact.id}&limit=1`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (convRes.ok) {
        const convBody = await convRes.json() as { data: Array<{ id: string }> };
        const conv = convBody.data[0];
        if (conv) {
          await fetch(`${api}/v1/conversations/${conv.id}/messages`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token ?? ""}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              contentType: "interactive",
              isSystemMessage: false,
              interactive: {
                type: "button",
                header: { type: "text", text: `Deal: ${title.trim().slice(0, 54)}` },
                body: { text: `Value: ${value || "–"}\n\n${notes.trim()}` },
                footer: { text: "Reply using the buttons below" },
                action: {
                  buttons: [
                    { type: "reply", reply: { id: `deal_accept_${deal.id}`, title: "✓ Accept" } },
                    { type: "reply", reply: { id: `deal_reject_${deal.id}`, title: "✗ Reject" } },
                    { type: "reply", reply: { id: `deal_negotiate_${deal.id}`, title: "~ Negotiate" } },
                  ],
                },
              },
            }),
          });
        } else {
          setSaving(false);
          setError("Deal saved. No active WhatsApp conversation found — message not sent.");
          onUpdated();
          return;
        }
      }
    }

    setSaving(false);
    onUpdated();
  }
```

- [ ] **Step 3: Replace the notify contact UI section**

Find the `{deal.contact && (` block (lines 183–210 of the original file). Replace the entire block with:

```tsx
          {/* Notify contact — only shown when deal has a linked contact */}
          {deal.contact && (
            <div className="border-t pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-gray-700">Notify contact on save</label>
                <button
                  type="button"
                  onClick={() => setNotifyContact((v) => !v)}
                  className={[
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    notifyContact ? "bg-green-500" : "bg-gray-200",
                  ].join(" ")}
                >
                  <span className={["inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform", notifyContact ? "translate-x-4" : "translate-x-1"].join(" ")} />
                </button>
              </div>
              {notifyContact && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-sm">
                  <p className="font-semibold text-gray-800 truncate">Deal: {title || "—"}</p>
                  <p className="text-gray-600">Value: {value || "—"}</p>
                  {notes.trim() ? (
                    <p className="text-gray-600 whitespace-pre-wrap text-xs">{notes.trim()}</p>
                  ) : (
                    <p className="text-amber-600 text-xs">Add notes to give the contact context before sending.</p>
                  )}
                  <div className="flex gap-1.5 pt-1 flex-wrap">
                    <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">✓ Accept</span>
                    <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">✗ Reject</span>
                    <span className="px-2 py-1 rounded border border-gray-300 text-xs text-gray-600 bg-white">~ Negotiate</span>
                  </div>
                  <p className="text-xs text-gray-400">Sent to {contactName}&apos;s active WhatsApp conversation.</p>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 4: Replace the save button**

Find the footer save button (inside `<div className="px-5 py-4 border-t space-y-2">`). Replace just the save button element:

```tsx
          <button
            onClick={() => void handleSave()}
            disabled={saving || !title.trim()}
            className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : notifyContact ? "Save & Notify Contact" : "Save Changes"}
          </button>
```

With:

```tsx
          {notifyContact ? (
            <>
              <button
                onClick={() => void handleSave(true)}
                disabled={saving || !title.trim() || !notes.trim()}
                className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Sending..." : "Save & Send"}
              </button>
              <button
                onClick={() => void handleSave(false)}
                disabled={saving || !title.trim()}
                className="w-full py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Save without notifying
              </button>
            </>
          ) : (
            <button
              onClick={() => void handleSave()}
              disabled={saving || !title.trim()}
              className="w-full py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          )}
```

- [ ] **Step 5: TypeScript check**

```bash
pnpm --filter @WBMSG/web type-check
```

Expected: 0 errors. If there are errors about `notifyMessage` still referenced somewhere, search for and remove any remaining references.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/deals/DealSlideOver.tsx
git commit -m "feat(deals): replace text deal notification with interactive WhatsApp proposal (accept/reject/negotiate)"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm --filter @WBMSG/web dev
```

Open `http://localhost:3000` and navigate to Deals. Open a deal that has a linked contact with a WhatsApp conversation.

- [ ] **Step 2: Verify preview card — notes empty**

Toggle "Notify contact on save" ON with notes field empty. Confirm:
- Preview card appears with deal title and value
- Amber warning: *"Add notes to give the contact context before sending."*
- No notes text shown
- Three button chips visible: ✓ Accept · ✗ Reject · ~ Negotiate
- "Save & Send" button is **disabled** (greyed out)
- "Save without notifying" button is **enabled**

- [ ] **Step 3: Verify preview card — notes filled**

Type text into the Notes field. Confirm:
- Preview card updates to show the notes text
- Amber warning disappears
- "Save & Send" button becomes **enabled**

- [ ] **Step 4: Verify send**

Click "Save & Send". Then open the agent inbox for the contact. Confirm:
- Interactive message bubble appears in the conversation thread
- Bubble shows deal title in header, value + notes in body, three buttons

- [ ] **Step 5: Verify toggle-off path**

Toggle notify OFF, click "Save Changes". Confirm: deal saves, no message sent, inbox unchanged.
