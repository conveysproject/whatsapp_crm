# Plan: handle taps on template quick-reply buttons

Small, isolated fix in one file. This short spec replaces a full PRD, as allowed by the product-task-workflow skill.

## Spec

**Problem.** When a customer taps a quick-reply button on a *template* message, Meta sends a webhook message with `type: "button"` and `button: { text, payload }` ([Meta reference](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/button)). Our webhook only reads `interactive.button_reply` (`apps/api/src/routes/webhooks.ts:22-42` for the type, `:309-332` for parsing). A template button tap therefore gets `body = null` and `richContent = null`, with this effect:
- The inbox shows an empty message.
- Auto-replies and AI intent matching are skipped, because they need a body (`apps/api/src/workers/inbound-message.worker.ts:323`).
- `button_reply` flows never fire, because they require `contentType === "interactive"` (`inbound-message.worker.ts:404-406`, `apps/api/src/lib/trigger-dispatcher.ts:78-84`).
- `inbound_message` and `keyword_match` flows are dispatched with an empty body (`inbound-message.worker.ts:399-402`).

**Prod evidence:** no `button` rows exist in `inbound_message_dump` yet, so no customer has been affected. Five Conveys sales templates with quick-reply buttons are now going to Meta for approval.

**Fix.** In the webhook's body extraction, treat `msg.button` exactly like an interactive button reply:
- `body = msg.button.text`
- `richContent = { button_reply: { id: msg.button.payload || msg.button.text, title: msg.button.text } }`
- `contentType` passed to the queue becomes `"interactive"` for these messages.

**Why normalize instead of adding a new `button` type:** every consumer already understands `interactive` + `button_reply`: the inbox bubble (`apps/web/components/inbox/MessageThread.tsx:162-176,353`), the messages page (`apps/web/app/(dashboard)/messages/page.tsx:97-101`), flow resume (`apps/api/src/lib/flow-runner.ts:184-190`), the trigger dispatcher and the worker. One file changes and no consumers do. The raw payload with the original `type: "button"` is still saved in `inbound_message_dump.raw_message` (`webhooks.ts:336-346`).

**Behavior after the fix:**
- The inbox shows the tapped label (for example "Send pricing").
- Active auto-replies match on the label. For example, "Yes, book a demo" hits the "contains demo" rule.
- A `button_reply` flow with `buttonText` equal to the label fires.
- Taps don't start `inbound_message` or `keyword_match` flows, the same rule that already applies to interactive replies (`inbound-message.worker.ts:395-402`).

**Non-goals:** the automation setup per button (auto-replies, tags, opt-out), fixing the pricing auto-reply data, and changes to the mobile app.

**Security:** the webhook signature check and org resolution are unchanged. No new route and no change to RBAC or org scoping. The job carries only `button.text` and `button.payload`, which are customer-supplied text like any message body.

**Rollout and rollback:** code only, with no migration, flag or data change. Roll back by reverting the commit.

## Tasks (TDD)

1. **Failing tests** in `apps/api/src/routes/webhooks.test.ts`, following the existing "enqueues message job" test (line 79):
   - A `type: "button"` message with `button: { text: "Send pricing", payload: "Send pricing" }` enqueues `contentType: "interactive"`, `body: "Send pricing"` and `richContent: { button_reply: { id: "Send pricing", title: "Send pricing" } }`.
   - A missing `payload` falls back to the text for `id`.
   - The existing `interactive.button_reply` and text-message tests still pass unchanged.
2. **Implement:** add `button?: { text?: string; payload?: string }` to `WaMessage`. Add a `msg.button?.text` branch in the body extraction, and map `contentType` to `"interactive"` when it's a template button tap.
3. **Verify:** run `/test-api` (known flaky: segments and conversations) and `/check`.
4. **Security audit note:** no route or auth changes.
5. Commit on a branch and merge locally (option 1). Pushing and deploying is the owner's call.
