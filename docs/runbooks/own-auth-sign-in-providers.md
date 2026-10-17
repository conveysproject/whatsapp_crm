# Own auth: setting up WhatsApp code, Google and Facebook sign-in

Owner steps for Phase 4 (`docs/superpowers/plans/2026-10-18-own-auth-phase4-providers.md`). Everything here only matters
when `AUTH_PROVIDER=wbmsg` (API) and `NEXT_PUBLIC_AUTH_PROVIDER=wbmsg` (web). Each method stays **hidden and switched off**
until its env vars are set, so these steps can be done in any order.

The code cannot create the Meta template or the Google/Facebook apps. These steps are for the owner.

---

## 1. WhatsApp sign-in code

### 1.1 Meta message template (submit from the Conveys WhatsApp Business account)

| Field | Value |
|---|---|
| Category | **Authentication** |
| Name | `wbmsg_login_code` (any name works; it must equal `AUTH_WHATSAPP_TEMPLATE`) |
| Language | English (US), code `en_US` (must equal `AUTH_WHATSAPP_TEMPLATE_LANG`) |
| Code delivery setup | **Copy code** |
| Add security recommendation | **On** |
| Add expiry time for the code | **On**, **10 minutes** |
| Button text | `Copy code` |

With Authentication templates Meta writes the message text itself. The message the user gets looks like:

> **123456** is your verification code. For your security, do not share this code.
> This code expires in 10 minutes.
> [Copy code]

You cannot add your own text, links or the sales signature to an Authentication template. That is a Meta rule.

The API sends the code as the body variable `{{1}}` and as the copy-code button parameter
(`apps/api/src/auth/whatsapp-codes.ts`). If Meta's preview for your template shows a different button type
(for example "One-tap autofill" for Android apps), keep **Copy code**: that is what the code sends.

### 1.2 Env vars (Railway, API service)

| Var | Value |
|---|---|
| `AUTH_WHATSAPP_ORG_ID` | The `organizations.id` of the Conveys org (its connected number sends the codes) |
| `AUTH_WHATSAPP_TEMPLATE` | `wbmsg_login_code` (after Meta approves it) |
| `AUTH_WHATSAPP_TEMPLATE_LANG` | `en_US` (optional; default `en_US`) |

The sender uses that org's `phone_number_id` and `waba_access_token`, the same as any other template send. If that org
were ever paused for billing, auth codes would stop too (the user is then offered the email code).

### 1.3 How people use it
1. Settings → Security → **WhatsApp number**: enter the number with country code → code on WhatsApp → Verify.
2. Sign-in page → **Send code on WhatsApp** → number → code. "Didn't get it? Email me a code instead" is always shown.
   WhatsApp is never a sign-up method; super admins cannot use it.

---

## 2. Google sign-in

1. Google Cloud console → create (or pick) a project "WBMSG Login".
2. **APIs & Services → OAuth consent screen**: External; app name "WBMSG"; support email; app domain `wbmsg.com`
   (or your web domain); authorized domain `wbmsg.com`; privacy policy `https://<web>/privacy`, terms `https://<web>/terms`.
   Scopes: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (no sensitive scopes, so no Google review is
   needed beyond branding verification). Publish the app ("In production").
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: `https://<web domain>` (for example `https://www.wbmsg.com`).
   - Authorized redirect URIs: **`https://<web domain>/api/auth/oauth/google/callback`**
     (add `http://localhost:3000/api/auth/oauth/google/callback` on a separate dev client for local testing).
4. Env vars on **Railway (API)**:
   - `AUTH_GOOGLE_CLIENT_ID` = the client ID
   - `AUTH_GOOGLE_CLIENT_SECRET` = the client secret
   - `WEB_URL` is already set for email. The redirect URI is built as `${AUTH_OAUTH_REDIRECT_BASE || WEB_URL}/api/auth/oauth/google/callback`;
     set `AUTH_OAUTH_REDIRECT_BASE` only if the sign-in domain differs from `WEB_URL`. It must exactly match the URI in step 3.

## 3. Facebook sign-in

Open question 0 in the PRD (my default): use a **separate** Meta app "WBMSG Login", so a login review or restriction can
never touch the WhatsApp Business app.

1. developers.facebook.com → **Create app** → use case **"Authenticate and request data from users with Facebook Login"** →
   app type Consumer/None → name "WBMSG Login".
2. **Facebook Login → Settings**:
   - Client OAuth login: **On**. Web OAuth login: **On**. Enforce HTTPS: **On**. Use Strict Mode for redirect URIs: **On**.
   - Valid OAuth Redirect URIs: **`https://<web domain>/api/auth/oauth/facebook/callback`**
   - Login with the JavaScript SDK: Off (not used).
3. **Use cases → permissions**: `email` and `public_profile` (both are standard access; no App Review needed for them).
4. **App settings → Basic**: privacy policy URL, terms URL, app icon, category; add the app domain. Switch the app to **Live**.
5. Env vars on **Railway (API)**:
   - `AUTH_FACEBOOK_APP_ID` = App ID
   - `AUTH_FACEBOOK_APP_SECRET` = App secret

Facebook does not promise a verified email, so a Facebook sign-in always asks for an email code before it links to an
existing account or creates a new one. If Facebook shares no email, the person types one and confirms it.

The code sends PKCE (`code_challenge` S256 + `code_verifier`) and the app secret. If Facebook ever rejects the PKCE
parameters on the first real test, report it: the app secret alone still protects the exchange.

---

## 4. Design notes (why it works this way)

- **Tokens never reach the browser.** The browser posts a form to the web BFF (`/api/auth/oauth/:provider/start`), which
  gets the provider URL from the API and stores the `state` in an httpOnly cookie. The provider sends the browser back to
  the BFF callback, which checks the state against that cookie and gives the code to the API. The API answers with the
  session; the BFF puts it in the usual httpOnly cookies. The PRD listed `GET` API routes; they are `POST` routes called
  only by the BFF so that the callback lands on the web domain.
- New accounts created by Google/Facebook have no workspace; they land on `/business-details`, which creates it.
- Linking rules (PRD §4.6): Google links to an existing account only when Google says the email is verified and it matches.
  Facebook (and Google with an unverified email) needs an email code first. Super admins cannot use Google, Facebook or
  WhatsApp sign-in.
- Unlinking in Settings → Security is refused when nothing else could sign the person in (password, another provider, or a
  verified WhatsApp number while WhatsApp sign-in is on).

## 5. Checks after switching each one on
- Web sign-in page shows the new button only after the env vars are set (`GET /api/auth/methods`).
- Sign in with a fresh Google account → lands on `/business-details`.
- Sign in with Google using the email of an existing account → lands on the dashboard; Settings → Security shows Google connected.
- Facebook with an existing email → "Confirm your email" → code → dashboard.
- Settings → Security → disconnect Google on an account without a password → refused with a clear message.
- WhatsApp: verify a number, sign out, "Send code on WhatsApp" → code arrives from the Conveys number.
