# Mobile Plan 2: App Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `apps/mobile` prototype into a working app shell: aligned Expo SDK, Clerk sign-in (blocking super admins), authenticated API client, 4-tab navigation, real-time updates, and push registration — ready for Plan 3 to fill in the screens.

**Architecture:** Expo Router app in the existing pnpm monorepo (`apps/mobile`). Clerk (`@clerk/expo` v4) handles identity; every API call and the Socket.IO handshake gets a fresh Clerk token. After sign-in, `GET /v1/users/me` decides access (super admins and users without a DB account are stopped). TanStack Query holds server state; socket events only invalidate query keys. Push uses the Plan 1 endpoints (`POST/DELETE /v1/users/device-token`, `GET /v1/conversations/unread-count`). Logic lives in small pure modules under `lib/` with Jest tests; screens stay thin.

**Tech Stack:** Expo SDK 57 (`expo@~57.0.0`, React Native/React versions chosen by `npx expo install --fix`), Expo Router, `@clerk/expo@^4.11.0`, `@tanstack/react-query@^5`, `socket.io-client@^4.8.3`, `expo-notifications`, `expo-secure-store`, `lucide-react-native`, `@expo-google-fonts/inter`, Jest via `jest-expo`.

**Spec:** `docs/prd-mobile-app.md` (sections 3, 4, 5 screens 1–2, 6 F1–F2, 7, 8). Mockups: https://claude.ai/artifact/T1xZ5zPGscLw29TuFZ7ev2 (screens 1.1, 1.2, tab bar).

## Global Constraints

- Same monorepo, folder `apps/mobile`, branch `feat/mobile-app` (owner, 2026-10-15).
- Super admins never use the mobile app: a `superAdmin` sign-in shows "Super admin accounts use the web dashboard" and is signed out (PRD §3 rule).
- Sign-up stays on the web; the app only signs in (PRD §5 screen 1).
- Only existing system features and names: tabs **Inbox · Contacts · Dashboard · Me**; notification types `new_message`, `conversation_assigned`, `closure_overdue` (PRD §4, §7).
- Brand: primary `#15803D`, font Inter, light theme (mockups; PRD §11 brand question still open — keep colours in one theme file).
- Minimum OS iOS 16+, Android 10+ (PRD §11 proposal).
- Push payload `data` contract from Plan 1: `{ type, conversationId?, contactId? }`.
- `DELETE /v1/users/device-token` must send `Content-Type: application/json` with a JSON body (Plan 1 review note).
- No API or web changes in this plan.
- Never use the word "Plivo". Commits end with a `Co-Authored-By:` trailer naming the model that wrote the commit.
- Run mobile tests from `apps/mobile` with `pnpm jest <path>`; type check with `pnpm tsc --noEmit`.

## Review Focus

- The app sits in the background for hours, then the user taps a chat → API calls and the socket must use a fresh Clerk token (never a cached one). Test: Task 2 Step 1 ("calls getToken on every request").
- A super admin signs in → they see the web-dashboard message, are signed out, and their phone is never registered for push. Test: Task 4 Step 1 (gate) + Task 7 Step 1 (`registerDevice` is only called from the `ok` branch).
- The user taps "Not now" or denies the OS permission → the app keeps working, no device-token request is sent, no crash. Test: Task 7 Step 1 ("returns null when permission is denied").
- A shared phone: user A signs out, user B signs in → A's token is removed from the server before Clerk sign-out, even if the network call fails A is still signed out. Test: Task 7 Step 1 (`signOutAndUnregister`).
- A push for a chat is tapped while the app is closed → the app opens that chat. Test: Task 7 Step 1 (`routeForNotification`); cold-start wiring checked in the manual device check.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/mobile/package.json` | Scripts + SDK-57-aligned dependencies; Jest preset |
| `apps/mobile/app.config.ts` (replaces `app.json`) | App identity, scheme `wbmsg`, plugins, EAS project id |
| `apps/mobile/eas.json` | Build profiles (development, preview, production) |
| `apps/mobile/tsconfig.json` | Extends `expo/tsconfig.base`, strict |
| `apps/mobile/.gitignore` | `.expo/`, native folders, build output |
| `apps/mobile/lib/config.ts` | Public env values (API URL, web URL, Clerk key) |
| `apps/mobile/lib/api.ts` (+ test) | `createApi(getToken)` fetch wrapper, `ApiError` |
| `apps/mobile/lib/api-context.tsx` | `ApiProvider` / `useApi()` built from Clerk `getToken` |
| `apps/mobile/lib/theme.ts` | Colours, spacing, radii, font names (from mockups) |
| `apps/mobile/lib/sign-in-steps.ts` (+ test) | Pure: Clerk sign-in status → next screen step |
| `apps/mobile/lib/session-gate.ts` (+ test) | `resolveGate(api)` → ok / super_admin / no_account / error |
| `apps/mobile/lib/me-context.tsx` | `MeProvider` / `useMe()` for the signed-in user |
| `apps/mobile/lib/realtime.ts` (+ test) | Socket connect with fresh token + retry; event → query keys |
| `apps/mobile/lib/push.ts` (+ test) | Permission, token, register/unregister, tap routing, sign-out |
| `apps/mobile/app/_layout.tsx` | Fonts, ClerkProvider, QueryClientProvider |
| `apps/mobile/app/index.tsx` | Redirect: signed in → `/inbox`, else `/sign-in` |
| `apps/mobile/app/(auth)/_layout.tsx`, `sign-in.tsx` | Sign-in screens (mockup 1.1) |
| `apps/mobile/app/(app)/_layout.tsx` | Session gate, realtime, push wiring, stack |
| `apps/mobile/app/(app)/(tabs)/_layout.tsx` + `inbox.tsx`, `contacts.tsx`, `dashboard.tsx`, `me.tsx` | Tab bar + placeholder screens (Plan 3 fills) |
| `apps/mobile/app/(app)/conversation/[id].tsx`, `contact/[id].tsx`, `notifications.tsx` | Placeholder routes push taps land on |
| `apps/mobile/app/(app)/push-permission.tsx` | Notification permission explainer (mockup 1.2) |
| `apps/mobile/components/Screen.tsx` | Shared safe-area screen wrapper with title |

Deleted (prototype): `App.tsx`, `app.json`, `app/(tabs)/*`, `app/conversation/[id].tsx`, `app/(auth)/sign-in.tsx` (rewritten), `components/ConversationListItem.tsx`, `components/MessageBubble.tsx`, `components/SendMessageForm.tsx`, `hooks/*`, `lib/notifications.ts`, tracked build artefacts (`.expo/`, `.turbo/`, `tsconfig.tsbuildinfo`).

---

### Task 1: Align the toolchain to Expo SDK 57 and clear the prototype

**Files:**
- Modify: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`
- Create: `apps/mobile/app.config.ts`, `apps/mobile/eas.json`, `apps/mobile/.gitignore`, `apps/mobile/app/_layout.tsx` (temporary), `apps/mobile/app/index.tsx` (temporary), `apps/mobile/lib/smoke.test.ts`
- Delete: the prototype files listed above, and `app.json`

**Interfaces:**
- Produces: a project where `pnpm tsc --noEmit`, `pnpm jest`, `npx expo-doctor` and `npx expo export --platform android` all succeed. Later tasks add files only.

- [ ] **Step 1: Remove the prototype and tracked artefacts**

```bash
cd /e/Product/WhatsApp_CRM/apps/mobile
git rm -q App.tsx app.json "app/(auth)/sign-in.tsx" "app/(tabs)/_layout.tsx" "app/(tabs)/index.tsx" "app/(tabs)/contacts.tsx" "app/(tabs)/campaigns.tsx" "app/(tabs)/settings.tsx" "app/conversation/[id].tsx" app/_layout.tsx components/ConversationListItem.tsx components/MessageBubble.tsx components/SendMessageForm.tsx hooks/useConversations.ts hooks/useMessages.ts hooks/useSendMessage.ts lib/notifications.ts
git rm -r -q --cached .expo .turbo tsconfig.tsbuildinfo 2>/dev/null || true
```

Create `apps/mobile/.gitignore`:

```gitignore
node_modules/
.expo/
.turbo/
dist/
dist-check/
ios/
android/
*.tsbuildinfo
.env*.local
```

- [ ] **Step 2: Set the SDK and dependencies**

Replace `apps/mobile/package.json` with:

```json
{
  "name": "@WBMSG/mobile",
  "version": "1.0.0",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "type-check": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx",
    "test": "jest",
    "doctor": "expo-doctor"
  },
  "jest": {
    "preset": "jest-expo",
    "testPathIgnorePatterns": ["/node_modules/", "/dist/", "/dist-check/"]
  },
  "dependencies": {
    "@WBMSG/shared": "workspace:*",
    "expo": "~57.0.0"
  },
  "devDependencies": {
    "@WBMSG/tsconfig": "workspace:*",
    "@types/react": "*",
    "typescript": "^5.4.0"
  }
}
```

Then install SDK-matched versions (the Expo CLI picks the versions that match SDK 57):

```bash
cd /e/Product/WhatsApp_CRM/apps/mobile
pnpm install
npx expo install expo-router expo-notifications expo-secure-store expo-device expo-constants expo-linking expo-status-bar expo-font expo-splash-screen react-native-safe-area-context react-native-screens react-native-svg @expo-google-fonts/inter
npx expo install -- --save-dev jest-expo jest @types/jest
pnpm add @clerk/expo@^4.11.0 @tanstack/react-query@^5.100.5 socket.io-client@^4.8.3 lucide-react-native
npx expo install --fix
```

`npx expo install --fix` sets `react`, `react-native`, `@types/react` and every `expo-*` package to the SDK 57 versions; keep whatever it writes. `expo-server-sdk` (a server library) is intentionally no longer a mobile dependency.

- [ ] **Step 3: App config, EAS profiles, TypeScript**

`apps/mobile/app.config.ts`:

```ts
import type { ExpoConfig } from "expo/config";

// Bundle id / package are placeholders until the owner confirms the store publisher (PRD §11 Q1).
const config: ExpoConfig = {
  name: "WBMSG",
  slug: "wbmsg",
  scheme: "wbmsg",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: { bundleIdentifier: "com.conveys.wbmsg", supportsTablet: true, deploymentTarget: "16.0" },
  android: { package: "com.conveys.wbmsg", minSdkVersion: 29, adaptiveIcon: { backgroundColor: "#15803D" } },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    ["expo-notifications", { color: "#15803D" }],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env["EAS_PROJECT_ID"] } },
};

export default config;
```

If `expo-doctor` reports that `ios.deploymentTarget` or `android.minSdkVersion` must be set through `expo-build-properties` for SDK 57, move them into `["expo-build-properties", { ios: { deploymentTarget: "16.0" }, android: { minSdkVersion: 29 } }]` (install it with `npx expo install expo-build-properties`) and remove the two keys above.

`apps/mobile/eas.json`:

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": { "developmentClient": true, "distribution": "internal" },
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

Replace `apps/mobile/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

If `npx expo install expo-router` did not install `expo-dev-client`, run `npx expo install expo-dev-client` (needed for the `development` EAS profile).

- [ ] **Step 4: Temporary entry screens and a smoke test**

`apps/mobile/app/_layout.tsx`:

```tsx
import { Slot } from "expo-router";

export default function RootLayout() {
  return <Slot />;
}
```

`apps/mobile/app/index.tsx`:

```tsx
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>WBMSG</Text>
    </View>
  );
}
```

`apps/mobile/lib/smoke.test.ts`:

```ts
describe("jest-expo setup", () => {
  it("runs TypeScript tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Verify the toolchain**

Run, in `apps/mobile`:

```bash
pnpm tsc --noEmit
pnpm jest lib/smoke.test.ts
npx expo-doctor
npx expo export --platform android --output-dir dist-check && rm -rf dist-check
```

Expected: type check clean; 1 test passes; expo-doctor reports no failed checks (warnings about the monorepo layout may be accepted if they say "can be ignored"); export ends with "Exported: dist-check". If `expo export` fails to resolve a workspace package under pnpm, add `apps/mobile/metro.config.js` with `const { getDefaultConfig } = require("expo/metro-config"); module.exports = getDefaultConfig(__dirname);` and retry. Do NOT switch pnpm to `node-linker=hoisted` (it changes the whole monorepo); if export still fails, report BLOCKED with the error.

- [ ] **Step 6: Commit**

```bash
cd /e/Product/WhatsApp_CRM
git add apps/mobile pnpm-lock.yaml
git commit -m "chore(mobile): align to Expo SDK 57, remove prototype, add EAS + Jest setup

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 2: Config, API client and theme

**Files:**
- Create: `apps/mobile/lib/config.ts`, `apps/mobile/lib/api.ts`, `apps/mobile/lib/api.test.ts`, `apps/mobile/lib/api-context.tsx`, `apps/mobile/lib/theme.ts`
- Delete: `apps/mobile/lib/smoke.test.ts`

**Interfaces:**
- Produces:
  - `config: { apiUrl: string; webUrl: string; clerkPublishableKey: string }`
  - `class ApiError extends Error { status: number; code: string }`
  - `type GetToken = () => Promise<string | null>`
  - `createApi(getToken: GetToken, baseUrl?: string): Api` where `type Api = <T>(path: string, init?: { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown }) => Promise<T>`; `path` is relative to `/v1` (e.g. `"/users/me"`).
  - `ApiProvider` (children) and `useApi(): Api`
  - `colors`, `space`, `radius`, `font` from `theme.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/api.test.ts
import { ApiError, createApi } from "./api";

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => (body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(body)),
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("createApi", () => {
  it("calls getToken on every request and sends it as a Bearer token under /v1", async () => {
    const fetchFn = mockFetch(200, { data: { ok: true } });
    const getToken = jest.fn().mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
    const api = createApi(getToken, "https://api.test");
    await api("/users/me");
    await api("/users/me");
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetchFn.mock.calls[0][0]).toBe("https://api.test/v1/users/me");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBe("Bearer t1");
    expect(fetchFn.mock.calls[1][1].headers.Authorization).toBe("Bearer t2");
    expect(fetchFn.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
  });

  it("sends JSON with Content-Type only when there is a body (also for DELETE)", async () => {
    const fetchFn = mockFetch(204, undefined);
    const api = createApi(async () => "t", "https://api.test");
    const result = await api("/users/device-token", { method: "DELETE", body: { token: "x" } });
    expect(result).toBeUndefined();
    const init = fetchFn.mock.calls[0][1];
    expect(init.method).toBe("DELETE");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ token: "x" }));
  });

  it("omits Authorization when there is no token", async () => {
    const fetchFn = mockFetch(200, {});
    await createApi(async () => null, "https://api.test")("/health");
    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("throws ApiError with the API's error code and message", async () => {
    mockFetch(404, { error: { code: "USER_NOT_FOUND", message: "User not found" } });
    const api = createApi(async () => "t", "https://api.test");
    await expect(api("/users/me")).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND", message: "User not found" });
    await expect(api("/users/me")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError with a generic message when the error body is not JSON", async () => {
    mockFetch(502, undefined);
    await expect(createApi(async () => "t", "https://api.test")("/x")).rejects.toMatchObject({ status: 502, code: "HTTP_ERROR" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /e/Product/WhatsApp_CRM/apps/mobile && pnpm jest lib/api.test.ts`
Expected: FAIL — cannot find module `./api`.

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/config.ts
export const config = {
  apiUrl: process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000",
  webUrl: process.env["EXPO_PUBLIC_WEB_URL"] ?? "http://localhost:3000",
  clerkPublishableKey: process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"] ?? "",
};
```

```ts
// apps/mobile/lib/api.ts
import { config } from "./config";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export type GetToken = () => Promise<string | null>;
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Api = <T>(path: string, init?: { method?: Method; body?: unknown }) => Promise<T>;

/** Fetch wrapper for the WBMSG API. A fresh Clerk token is requested for every call. */
export function createApi(getToken: GetToken, baseUrl: string = config.apiUrl): Api {
  return async function api<T>(path: string, init: { method?: Method; body?: unknown } = {}): Promise<T> {
    const token = await getToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const hasBody = init.body !== undefined;
    if (hasBody) headers["Content-Type"] = "application/json";

    const res = await fetch(`${baseUrl}/v1${path}`, {
      method: init.method ?? "GET",
      headers,
      ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
    });
    if (res.status === 204) return undefined as T;

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new ApiError(res.status, err?.code ?? "HTTP_ERROR", err?.message ?? `Request failed (${res.status})`);
    }
    return json as T;
  };
}
```

```tsx
// apps/mobile/lib/api-context.tsx
import { useAuth } from "@clerk/expo";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { createApi, type Api } from "./api";

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const api = useMemo(() => createApi(() => getToken()), [getToken]);
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("useApi must be used inside ApiProvider");
  return api;
}
```

```ts
// apps/mobile/lib/theme.ts
// Values from the approved mockups. PRD §11 (brand) is still open: change colours here only.
export const colors = {
  brand: "#15803D",
  brandDark: "#166534",
  brandSoft: "#DCFCE7",
  text: "#111827",
  textMuted: "#4B5563",
  textSubtle: "#6B7280",
  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  surface: "#FFFFFF",
  background: "#F3F4F6",
  danger: "#B91C1C",
  dangerSoft: "#FEE2E2",
  warning: "#92400E",
  warningSoft: "#FEF3C7",
  chatBackground: "#EFEAE2",
  bubbleOut: "#DCF8C6",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;
```

Delete `lib/smoke.test.ts` (`git rm apps/mobile/lib/smoke.test.ts`).

If `@clerk/expo` v4's `useAuth().getToken` has a different signature (check `node_modules/@clerk/expo` types), adapt only the arrow in `api-context.tsx` so it still returns `Promise<string | null>`.

- [ ] **Step 4: Run tests and type check**

Run: `cd /e/Product/WhatsApp_CRM/apps/mobile && pnpm jest lib/api.test.ts && pnpm tsc --noEmit`
Expected: 5 tests pass; type check clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib
git commit -m "feat(mobile): config, authenticated API client and theme tokens

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 3: Clerk sign-in flow

**Files:**
- Create: `apps/mobile/lib/sign-in-steps.ts`, `apps/mobile/lib/sign-in-steps.test.ts`, `apps/mobile/app/(auth)/_layout.tsx`, `apps/mobile/app/(auth)/sign-in.tsx`
- Modify: `apps/mobile/app/_layout.tsx` (ClerkProvider, fonts, QueryClient, ApiProvider), `apps/mobile/app/index.tsx` (redirect)

**Interfaces:**
- Consumes: `config`, `ApiProvider`, `colors/space/radius/font` (Task 2).
- Produces:
  - `type SignInStep = "email" | "password" | "email_code" | "unsupported_2fa" | "done"`
  - `stepAfterAttempt(status: string | null | undefined, secondFactors: ReadonlyArray<{ strategy: string }> | null | undefined): SignInStep`
  - Routes: `/sign-in`; `/` redirects to `/inbox` when signed in (the `(app)` group lands in Task 4/5).

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/sign-in-steps.test.ts
import { stepAfterAttempt } from "./sign-in-steps";

describe("stepAfterAttempt", () => {
  it("is done when Clerk reports complete", () => {
    expect(stepAfterAttempt("complete", [])).toBe("done");
  });
  it("asks for the emailed code on a new device (needs_client_trust)", () => {
    expect(stepAfterAttempt("needs_client_trust", [{ strategy: "email_code" }])).toBe("email_code");
  });
  it("uses the email code for a second factor when one is offered", () => {
    expect(stepAfterAttempt("needs_second_factor", [{ strategy: "totp" }, { strategy: "email_code" }])).toBe("email_code");
  });
  it("sends the user to the web when the only second factor is not supported in the app", () => {
    expect(stepAfterAttempt("needs_second_factor", [{ strategy: "totp" }])).toBe("unsupported_2fa");
    expect(stepAfterAttempt("needs_client_trust", null)).toBe("unsupported_2fa");
  });
  it("stays on the password step for anything else", () => {
    expect(stepAfterAttempt("needs_first_factor", [])).toBe("password");
    expect(stepAfterAttempt(undefined, undefined)).toBe("password");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /e/Product/WhatsApp_CRM/apps/mobile && pnpm jest lib/sign-in-steps.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement the step logic**

```ts
// apps/mobile/lib/sign-in-steps.ts
export type SignInStep = "email" | "password" | "email_code" | "unsupported_2fa" | "done";

/** Maps Clerk's sign-in status after a password attempt to the next screen step. */
export function stepAfterAttempt(
  status: string | null | undefined,
  secondFactors: ReadonlyArray<{ strategy: string }> | null | undefined,
): SignInStep {
  if (status === "complete") return "done";
  if (status === "needs_client_trust" || status === "needs_second_factor") {
    return (secondFactors ?? []).some((f) => f.strategy === "email_code") ? "email_code" : "unsupported_2fa";
  }
  return "password";
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest lib/sign-in-steps.test.ts` → 5 pass.

- [ ] **Step 5: Root layout, redirect and sign-in screen**

`apps/mobile/app/_layout.tsx`:

```tsx
import { ClerkProvider } from "@clerk/expo";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ApiProvider } from "../lib/api-context";
import { config } from "../lib/config";

void SplashScreen.preventAutoHideAsync();

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;

  return (
    <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <StatusBar style="dark" />
          <Slot />
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
```

`apps/mobile/app/index.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null;
  return <Redirect href={isSignedIn ? "/inbox" : "/sign-in"} />;
}
```

`apps/mobile/app/(auth)/_layout.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";

export default function AuthLayout() {
  const { isLoaded, isSignedIn } = useAuth();
  if (isLoaded && isSignedIn) return <Redirect href="/inbox" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

`apps/mobile/app/(auth)/sign-in.tsx` — layout and copy follow mockup 1.1 (logo tile, "Sign in to WBMSG", "Use the same account you use on the web.", email → Continue, password → Sign in, 6-digit code → Verify, "New to WBMSG? Create your account at" web link, "Same login as the web dashboard"):

```tsx
import { useSignIn } from "@clerk/expo";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { config } from "../../lib/config";
import { stepAfterAttempt, type SignInStep } from "../../lib/sign-in-steps";
import { colors, font, radius, space } from "../../lib/theme";

export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<SignInStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const busy = fetchStatus === "fetching";

  async function finish() {
    await signIn.finalize();
  }

  async function submitPassword() {
    setFormError(null);
    const { error } = await signIn.password({ emailAddress: email.trim(), password });
    if (error) {
      setFormError(errors.fields.identifier?.message ?? errors.fields.password?.message ?? "Couldn't sign in. Check your email and password.");
      return;
    }
    const next = stepAfterAttempt(signIn.status, signIn.supportedSecondFactors);
    if (next === "email_code") await signIn.mfa.sendEmailCode();
    if (next === "done") await finish();
    setStep(next);
  }

  async function submitCode() {
    setFormError(null);
    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (error) {
      setFormError("That code didn't work. Check it and try again.");
      return;
    }
    if (signIn.status === "complete") await finish();
  }

  const title = step === "password" ? "Enter your password" : step === "email_code" ? "Check your email" : "Sign in to WBMSG";
  const subtitle =
    step === "password"
      ? email
      : step === "email_code"
        ? `This is a new device, so we sent a 6-digit code to ${email}.`
        : step === "unsupported_2fa"
          ? "Your account uses a two-step method the app doesn't support yet. Finish signing in on the web dashboard."
          : "Use the same account you use on the web.";

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={styles.body} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {step !== "email" && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => { setFormError(null); setStep(step === "email_code" ? "password" : "email"); }} style={styles.back}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
        )}
        <View style={styles.logo}><Text style={styles.logoText}>W</Text></View>
        <Text style={styles.title} accessibilityRole="header">{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {step === "email" && (
          <>
            <Text style={styles.label}>Work email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" accessibilityLabel="Work email" />
            <Pressable accessibilityRole="button" style={[styles.primary, !email.trim() && styles.disabled]} disabled={!email.trim()} onPress={() => setStep("password")}>
              <Text style={styles.primaryText}>Continue</Text>
            </Pressable>
          </>
        )}

        {step === "password" && (
          <>
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" accessibilityLabel="Password" />
            <Pressable accessibilityRole="button" style={[styles.primary, (!password || busy) && styles.disabled]} disabled={!password || busy} onPress={() => void submitPassword()}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Sign in</Text>}
            </Pressable>
            <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(`${config.webUrl}/sign-in`)} style={styles.ghost}>
              <Text style={styles.ghostText}>Forgot password?</Text>
            </Pressable>
          </>
        )}

        {step === "email_code" && (
          <>
            <Text style={styles.label}>6-digit code</Text>
            <TextInput style={[styles.input, styles.code]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" accessibilityLabel="6-digit code" />
            <Pressable accessibilityRole="button" style={[styles.primary, (code.trim().length !== 6 || busy) && styles.disabled]} disabled={code.trim().length !== 6 || busy} onPress={() => void submitCode()}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Verify</Text>}
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => void signIn.mfa.sendEmailCode()} style={styles.ghost}>
              <Text style={styles.ghostText}>Send a new code</Text>
            </Pressable>
          </>
        )}

        {step === "unsupported_2fa" && (
          <Pressable accessibilityRole="link" style={styles.primary} onPress={() => void Linking.openURL(`${config.webUrl}/sign-in`)}>
            <Text style={styles.primaryText}>Open web dashboard</Text>
          </Pressable>
        )}

        {formError && <Text style={styles.error} accessibilityRole="alert">{formError}</Text>}

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            New to WBMSG? Create your account at{" "}
            <Text style={styles.link} onPress={() => void Linking.openURL(config.webUrl)}>the web dashboard</Text>
          </Text>
          <Text style={styles.footerHint}>Same login as the web dashboard</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  body: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xl, gap: space.md },
  back: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  backText: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  logo: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: space.lg },
  logoText: { fontFamily: font.bold, fontSize: 26, color: "#FFFFFF" },
  title: { fontFamily: font.bold, fontSize: 26, color: colors.text, marginTop: space.sm },
  subtitle: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, marginBottom: space.md },
  label: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  input: { height: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontSize: 16, fontFamily: font.regular, color: colors.text },
  code: { letterSpacing: 8, textAlign: "center", fontFamily: font.semibold, fontSize: 22 },
  primary: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  ghost: { minHeight: 44, justifyContent: "center", alignSelf: "center" },
  ghostText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
  footer: { marginTop: "auto", paddingBottom: space.xl, alignItems: "center", gap: space.sm },
  footerText: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: "center" },
  link: { fontFamily: font.semibold, color: colors.brand },
  footerHint: { fontFamily: font.regular, fontSize: 12, color: colors.textSubtle },
});
```

Clerk v4 API notes (verified against Clerk's current custom-flow docs; confirm names in `node_modules/@clerk/expo` / `@clerk/shared` types): `useSignIn()` returns `{ signIn, errors, fetchStatus }`; `signIn.password({ emailAddress, password })` returns `{ error }`; `signIn.mfa.sendEmailCode()`; `signIn.mfa.verifyEmailCode({ code })`; `signIn.finalize()`; `signIn.supportedSecondFactors`; errors under `errors.fields.identifier` / `errors.fields.password`. If `finalize` requires an argument in the installed types, pass `{ navigate: () => router.replace("/") }` using `useRouter()` from `expo-router`. If any other name differs, use the installed type's name and record the difference in the report — do not fall back to the legacy `signIn.create` API.

- [ ] **Step 6: Type check, bundle, commit**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`
Expected: clean; all tests pass; bundle exports. (The `/inbox` route is added in Task 5; until then `typedRoutes` may flag `href="/inbox"` — if it does, cast with `href={"/inbox" as never}` and remove the cast in Task 5.)

```bash
git add apps/mobile
git commit -m "feat(mobile): Clerk sign-in (email, password, new-device email code) with web fallback for unsupported 2FA

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 4: Session gate (super admin block, missing account)

**Files:**
- Create: `apps/mobile/lib/session-gate.ts`, `apps/mobile/lib/session-gate.test.ts`, `apps/mobile/lib/me-context.tsx`, `apps/mobile/components/Screen.tsx`, `apps/mobile/app/(app)/_layout.tsx`

**Interfaces:**
- Consumes: `Api`, `ApiError`, `useApi` (Task 2).
- Produces:
  - `type Role = "superAdmin" | "admin" | "manager" | "agent" | "viewer"`
  - `interface Me { id: string; fullName: string; email: string; role: Role; organizationId: string; availability: string; permissions: Record<string, string> }`
  - `type Gate = { kind: "ok"; me: Me } | { kind: "super_admin" } | { kind: "no_account" } | { kind: "error"; message: string }`
  - `resolveGate(api: Api): Promise<Gate>`
  - `MeProvider({ me, children })`, `useMe(): Me`
  - `Screen({ title?, children, scroll? })` — safe-area wrapper used by every placeholder screen
  - `app/(app)/_layout.tsx` renders `<Stack screenOptions={{ headerShown: false }} />` only for `ok`; Task 6 and 7 add hooks into this file.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/session-gate.test.ts
import { ApiError, type Api } from "./api";
import { resolveGate, type Me } from "./session-gate";

const me: Me = { id: "u-1", fullName: "Maria Lopez", email: "m@x.com", role: "admin", organizationId: "org-1", availability: "online", permissions: {} };
const apiReturning = (impl: () => Promise<unknown>) => jest.fn(impl) as unknown as Api;

describe("resolveGate", () => {
  it("lets customer roles in", async () => {
    for (const role of ["admin", "manager", "agent", "viewer"] as const) {
      const gate = await resolveGate(apiReturning(async () => ({ data: { ...me, role } })));
      expect(gate).toEqual({ kind: "ok", me: { ...me, role } });
    }
  });
  it("blocks super admins", async () => {
    expect(await resolveGate(apiReturning(async () => ({ data: { ...me, role: "superAdmin" } })))).toEqual({ kind: "super_admin" });
  });
  it("treats 401/403/404 as no WBMSG account", async () => {
    for (const status of [401, 403, 404]) {
      const gate = await resolveGate(apiReturning(async () => { throw new ApiError(status, "X", "x"); }));
      expect(gate).toEqual({ kind: "no_account" });
    }
  });
  it("reports other failures as retryable errors", async () => {
    expect(await resolveGate(apiReturning(async () => { throw new ApiError(500, "X", "boom"); }))).toEqual({ kind: "error", message: "boom" });
    expect(await resolveGate(apiReturning(async () => { throw new TypeError("Network request failed"); }))).toEqual({ kind: "error", message: "Network request failed" });
  });
  it("asks /users/me", async () => {
    const api = apiReturning(async () => ({ data: me }));
    await resolveGate(api);
    expect(api).toHaveBeenCalledWith("/users/me");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest lib/session-gate.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/session-gate.ts
import { ApiError, type Api } from "./api";

export type Role = "superAdmin" | "admin" | "manager" | "agent" | "viewer";
export interface Me {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  organizationId: string;
  availability: string;
  permissions: Record<string, string>;
}
export type Gate = { kind: "ok"; me: Me } | { kind: "super_admin" } | { kind: "no_account" } | { kind: "error"; message: string };

/** Decides whether the signed-in Clerk user may use the app. Super admins never use the mobile app (owner rule). */
export async function resolveGate(api: Api): Promise<Gate> {
  try {
    const { data } = await api<{ data: Me }>("/users/me");
    return data.role === "superAdmin" ? { kind: "super_admin" } : { kind: "ok", me: data };
  } catch (err) {
    if (err instanceof ApiError && [401, 403, 404].includes(err.status)) return { kind: "no_account" };
    return { kind: "error", message: (err as Error).message };
  }
}
```

```tsx
// apps/mobile/lib/me-context.tsx
import { createContext, useContext, type ReactNode } from "react";
import type { Me } from "./session-gate";

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe must be used inside MeProvider");
  return me;
}
```

```tsx
// apps/mobile/components/Screen.tsx
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, space } from "../lib/theme";

export function Screen({ title, children, scroll = false }: { title?: string; children?: ReactNode; scroll?: boolean }) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
      <Body style={styles.body}>{children}</Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.text, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm },
  body: { flex: 1 },
});
```

```tsx
// apps/mobile/app/(app)/_layout.tsx
import { useAuth } from "@clerk/expo";
import { useQuery } from "@tanstack/react-query";
import { Redirect, Stack } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useApi } from "../../lib/api-context";
import { MeProvider } from "../../lib/me-context";
import { resolveGate } from "../../lib/session-gate";
import { colors, font, radius, space } from "../../lib/theme";

function Message({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable accessibilityRole="button" style={styles.button} onPress={onAction}>
        <Text style={styles.buttonText}>{action}</Text>
      </Pressable>
    </View>
  );
}

export default function AppLayout() {
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const api = useApi();
  const gate = useQuery({ queryKey: ["gate"], queryFn: () => resolveGate(api), enabled: isLoaded && isSignedIn === true, staleTime: Infinity });

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/sign-in" />;
  if (!gate.data) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  switch (gate.data.kind) {
    case "super_admin":
      return <Message title="Use the web dashboard" body="Super admin accounts use the web dashboard." action="Sign out" onAction={() => void signOut()} />;
    case "no_account":
      return <Message title="No WBMSG account" body="This login isn't part of a WBMSG workspace yet. Ask your admin to invite you, then sign in again." action="Sign out" onAction={() => void signOut()} />;
    case "error":
      return <Message title="Can't reach WBMSG" body={gate.data.message} action="Try again" onAction={() => void gate.refetch()} />;
    case "ok":
      return (
        <MeProvider me={gate.data.me}>
          <Stack screenOptions={{ headerShown: false }} />
        </MeProvider>
      );
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl, gap: space.md, backgroundColor: colors.surface },
  title: { fontFamily: font.bold, fontSize: 22, color: colors.text, textAlign: "center" },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  button: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: space.sm },
  buttonText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
```

The "Super admin accounts use the web dashboard" string is the exact owner-approved copy (PRD §3) — do not reword it.

- [ ] **Step 4: Run tests, type check**

Run: `pnpm jest lib/session-gate.test.ts && pnpm tsc --noEmit` → 5 pass; clean.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): session gate — block super admins and users without a WBMSG account

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 5: Navigation shell (4 tabs and placeholder routes)

**Files:**
- Create: `apps/mobile/app/(app)/(tabs)/_layout.tsx`, `inbox.tsx`, `contacts.tsx`, `dashboard.tsx`, `me.tsx`; `apps/mobile/app/(app)/conversation/[id].tsx`, `apps/mobile/app/(app)/contact/[id].tsx`, `apps/mobile/app/(app)/notifications.tsx`

**Interfaces:**
- Consumes: `Screen` (Task 4), `useMe` (Task 4), theme.
- Produces: routes `/inbox`, `/contacts`, `/dashboard`, `/me`, `/conversation/[id]`, `/contact/[id]`, `/notifications`. Plan 3 replaces each placeholder body; the route paths are a contract (push taps in Task 7 navigate to them).

- [ ] **Step 1: Tab layout**

```tsx
// apps/mobile/app/(app)/(tabs)/_layout.tsx
import { Tabs } from "expo-router";
import { ChartColumn, CircleUserRound, MessageSquare, Users } from "lucide-react-native";
import { colors, font } from "../../../lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size} /> }} />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
```

If an icon name does not exist in the installed `lucide-react-native` version, use its documented equivalent (`BarChart3` for `ChartColumn`, `UserCircle` for `CircleUserRound`) and note it.

- [ ] **Step 2: Placeholder screens**

Each placeholder uses `Screen` with the tab's title and nothing else, so Plan 3 replaces only the body:

```tsx
// apps/mobile/app/(app)/(tabs)/inbox.tsx
import { Screen } from "../../../components/Screen";

export default function InboxScreen() {
  return <Screen title="Inbox" />;
}
```

Create `contacts.tsx` (title "Contacts"), `dashboard.tsx` (title "Dashboard") the same way.

`me.tsx` shows the signed-in user so the gate can be checked on a device (Task 7 adds sign-out):

```tsx
// apps/mobile/app/(app)/(tabs)/me.tsx
import { StyleSheet, Text } from "react-native";
import { Screen } from "../../../components/Screen";
import { useMe } from "../../../lib/me-context";
import { colors, font, space } from "../../../lib/theme";

export default function MeScreen() {
  const me = useMe();
  return (
    <Screen title="Me">
      <Text style={styles.name}>{me.fullName}</Text>
      <Text style={styles.sub}>{me.email}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.semibold, fontSize: 17, color: colors.text, paddingHorizontal: space.xl },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, paddingHorizontal: space.xl, marginTop: space.xs },
});
```

```tsx
// apps/mobile/app/(app)/conversation/[id].tsx
import { Screen } from "../../../components/Screen";

// Plan 3 renders the conversation for the `id` route param here.
export default function ConversationScreen() {
  return <Screen title="Chat" />;
}
```

Write `contact/[id].tsx` (title "Contact Details") and `notifications.tsx` (title "Notifications") the same way. Remove any `as never` cast added in Task 3 now that `/inbox` exists.

- [ ] **Step 3: Verify**

Run: `pnpm tsc --noEmit && pnpm jest && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`
Expected: clean; all tests pass; export succeeds and lists the routes.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): 4-tab navigation shell (Inbox, Contacts, Dashboard, Me) and placeholder routes

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 6: Real-time updates

**Files:**
- Create: `apps/mobile/lib/realtime.ts`, `apps/mobile/lib/realtime.test.ts`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (start realtime inside the `ok` branch)

**Interfaces:**
- Consumes: `config.apiUrl`, `GetToken` (Task 2).
- Produces:
  - `queryKeysFor(event: string, payload: unknown): ReadonlyArray<readonly unknown[]>` — query keys Plan 3 must use: `["conversations"]`, `["messages", conversationId]`, `["notifications"]`, `["unread-count"]`.
  - `connectRealtime(opts: { url: string; getToken: GetToken; onEvent: (event: string, payload: unknown) => void }): { disconnect(): void; ensureConnected(): void }`
  - `RealtimeBridge` component, defined in `app/(app)/_layout.tsx`, that invalidates those query keys.

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/realtime.test.ts
import { connectRealtime, queryKeysFor } from "./realtime";

type Handler = (...args: unknown[]) => void;
const mockHandlers: Record<string, Handler[]> = {};
let mockAnyHandler: Handler | null = null;
const mockSocket = {
  active: true,
  connected: false,
  auth: undefined as unknown,
  connect: jest.fn(),
  disconnect: jest.fn(),
  on: jest.fn((ev: string, h: Handler) => { (mockHandlers[ev] ??= []).push(h); }),
  off: jest.fn(),
  onAny: jest.fn((h: Handler) => { mockAnyHandler = h; }),
  offAny: jest.fn(),
};
jest.mock("socket.io-client", () => ({ io: jest.fn(() => mockSocket) }));

beforeEach(() => {
  jest.useFakeTimers();
  for (const k of Object.keys(mockHandlers)) delete mockHandlers[k];
  mockAnyHandler = null;
  jest.clearAllMocks();
  mockSocket.active = true;
  mockSocket.connected = false;
});
afterEach(() => jest.useRealTimers());

describe("queryKeysFor", () => {
  it("maps a new message to the list, the thread and the badge", () => {
    expect(queryKeysFor("new-message", { conversationId: "c-1" })).toEqual([["conversations"], ["unread-count"], ["messages", "c-1"]]);
  });
  it("maps assignment and status changes to the list and the badge", () => {
    for (const ev of ["conversation:assign", "conversation:assigned", "conversation:status"]) {
      expect(queryKeysFor(ev, { conversationId: "c-1" })).toEqual([["conversations"], ["unread-count"]]);
    }
  });
  it("maps notifications to the feed and the badge", () => {
    expect(queryKeysFor("notification", {})).toEqual([["notifications"], ["unread-count"]]);
  });
  it("ignores unknown events and bad payloads", () => {
    expect(queryKeysFor("campaign:progress", {})).toEqual([]);
    expect(queryKeysFor("new-message", null)).toEqual([["conversations"], ["unread-count"]]);
  });
});

describe("connectRealtime", () => {
  it("fetches a fresh token for every handshake", async () => {
    const getToken = jest.fn().mockResolvedValueOnce("t1").mockResolvedValueOnce("t2");
    connectRealtime({ url: "https://api.test", getToken, onEvent: jest.fn() });
    const auth = mockSocket.auth as (cb: (d: { token: string | null }) => void) => void;
    const first = await new Promise((r) => auth(r));
    const second = await new Promise((r) => auth(r));
    expect(first).toEqual({ token: "t1" });
    expect(second).toEqual({ token: "t2" });
  });

  it("passes a null token when Clerk fails instead of hanging", async () => {
    connectRealtime({ url: "https://api.test", getToken: jest.fn().mockRejectedValue(new Error("x")), onEvent: jest.fn() });
    const auth = mockSocket.auth as (cb: (d: { token: string | null }) => void) => void;
    await expect(new Promise((r) => auth(r))).resolves.toEqual({ token: null });
  });

  it("forwards every event", () => {
    const onEvent = jest.fn();
    connectRealtime({ url: "https://api.test", getToken: async () => "t", onEvent });
    mockAnyHandler?.("new-message", { conversationId: "c-1" });
    expect(onEvent).toHaveBeenCalledWith("new-message", { conversationId: "c-1" });
  });

  it("retries with backoff after an auth rejection and stops after disconnect", () => {
    const rt = connectRealtime({ url: "https://api.test", getToken: async () => "t", onEvent: jest.fn() });
    mockSocket.active = false;
    mockHandlers["connect_error"]?.[0]?.(new Error("unauthorized"));
    jest.advanceTimersByTime(1999);
    expect(mockSocket.connect).toHaveBeenCalledTimes(1); // initial connect only
    jest.advanceTimersByTime(1);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
    rt.disconnect();
    mockHandlers["connect_error"]?.[0]?.(new Error("unauthorized"));
    jest.advanceTimersByTime(60_000);
    expect(mockSocket.connect).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest lib/realtime.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/mobile/lib/realtime.ts
import { io } from "socket.io-client";
import type { GetToken } from "./api";

/** Which TanStack Query keys a server event makes stale. */
export function queryKeysFor(event: string, payload: unknown): ReadonlyArray<readonly unknown[]> {
  const conversationId =
    payload && typeof payload === "object" && typeof (payload as { conversationId?: unknown }).conversationId === "string"
      ? (payload as { conversationId: string }).conversationId
      : null;
  switch (event) {
    case "new-message":
      return conversationId
        ? [["conversations"], ["unread-count"], ["messages", conversationId]]
        : [["conversations"], ["unread-count"]];
    case "conversation:assign":
    case "conversation:assigned":
    case "conversation:status":
      return [["conversations"], ["unread-count"]];
    case "notification":
      return [["notifications"], ["unread-count"]];
    default:
      return [];
  }
}

const RETRY_BASE_MS = 2_000;
const RETRY_MAX_MS = 30_000;

/** Socket.IO connection that sends a fresh Clerk token on every handshake and retries after an auth rejection. */
export function connectRealtime(opts: {
  url: string;
  getToken: GetToken;
  onEvent: (event: string, payload: unknown) => void;
}): { disconnect(): void; ensureConnected(): void } {
  const socket = io(opts.url, { autoConnect: false, transports: ["websocket"] });
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  socket.auth = (cb: (data: { token: string | null }) => void) => {
    opts.getToken().then((token) => cb({ token }), () => cb({ token: null }));
  };

  const onConnect = () => { attempt = 0; };
  const onConnectError = (err: Error) => {
    if (stopped || err.message !== "unauthorized" || socket.active) return;
    if (timer) clearTimeout(timer);
    const delay = Math.min(RETRY_BASE_MS * 2 ** attempt, RETRY_MAX_MS);
    attempt += 1;
    timer = setTimeout(() => { timer = null; if (!stopped) socket.connect(); }, delay);
  };

  socket.on("connect", onConnect);
  socket.on("connect_error", onConnectError);
  socket.onAny((event: string, payload: unknown) => opts.onEvent(event, payload));
  socket.connect();

  return {
    disconnect() {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket.off("connect", onConnect);
      socket.off("connect_error", onConnectError);
      socket.offAny();
      socket.disconnect();
    },
    ensureConnected() {
      if (!stopped && !socket.connected) socket.connect();
    },
  };
}
```

In `apps/mobile/app/(app)/_layout.tsx`, add above `AppLayout`:

```tsx
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import { config } from "../../lib/config";
import { connectRealtime, queryKeysFor } from "../../lib/realtime";

function RealtimeBridge() {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  useEffect(() => {
    const rt = connectRealtime({
      url: config.apiUrl,
      getToken: () => getToken(),
      onEvent: (event, payload) => {
        for (const queryKey of queryKeysFor(event, payload)) void queryClient.invalidateQueries({ queryKey });
      },
    });
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        rt.ensureConnected();
        void queryClient.invalidateQueries();
      }
    });
    return () => { sub.remove(); rt.disconnect(); };
  }, [getToken, queryClient]);
  return null;
}
```

(merge the imports with the file's existing ones) and render it in the `ok` branch:

```tsx
        <MeProvider me={gate.data.me}>
          <RealtimeBridge />
          <Stack screenOptions={{ headerShown: false }} />
        </MeProvider>
```

- [ ] **Step 4: Run tests, type check, bundle**

Run: `pnpm jest lib/realtime.test.ts && pnpm tsc --noEmit && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`
Expected: 8 tests pass; clean; export succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile
git commit -m "feat(mobile): real-time updates over authenticated Socket.IO with retry and foreground refresh

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

### Task 7: Push registration, permission explainer, tap routing, badge, sign-out

**Files:**
- Create: `apps/mobile/lib/push.ts`, `apps/mobile/lib/push.test.ts`, `apps/mobile/app/(app)/push-permission.tsx`
- Modify: `apps/mobile/app/(app)/_layout.tsx` (push wiring in the `ok` branch), `apps/mobile/app/(app)/(tabs)/me.tsx` (Sign out button)

**Interfaces:**
- Consumes: `Api` (Task 2), routes from Task 5, Plan 1 endpoints.
- Produces:
  - `routeForNotification(data: unknown): string | null`
  - `getPushToken(): Promise<string | null>`
  - `registerDevice(api: Api): Promise<string | null>` — stores the token in SecureStore key `wbmsg.pushToken`
  - `unregisterDevice(api: Api): Promise<void>`
  - `signOutAndUnregister(api: Api, signOut: () => Promise<unknown>): Promise<void>`
  - `shouldAskForPushPermission(): Promise<boolean>` / `markPushPermissionAsked(): Promise<void>` (SecureStore key `wbmsg.pushAsked`)
  - `refreshBadge(api: Api): Promise<void>`

- [ ] **Step 1: Write the failing test**

```ts
// apps/mobile/lib/push.test.ts
import type { Api } from "./api";

const mockStore: Record<string, string> = {};
jest.mock("expo-secure-mockStore", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
const mockNotif = {
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
};
jest.mock("expo-notifications", () => mockNotif);
jest.mock("expo-device", () => ({ isDevice: true }));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { extra: { eas: { projectId: "proj-1" } } } } }));

import { getPushToken, refreshBadge, registerDevice, routeForNotification, shouldAskForPushPermission, markPushPermissionAsked, signOutAndUnregister, unregisterDevice } from "./push";

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
});

describe("routeForNotification", () => {
  it("opens the chat for message and assignment pushes", () => {
    expect(routeForNotification({ type: "new_message", conversationId: "c-1" })).toBe("/conversation/c-1");
    expect(routeForNotification({ type: "conversation_assigned", conversationId: "c-2" })).toBe("/conversation/c-2");
  });
  it("opens the contact for overdue lead closures", () => {
    expect(routeForNotification({ type: "closure_overdue", contactId: "ct-1" })).toBe("/contact/ct-1");
  });
  it("ignores anything else", () => {
    expect(routeForNotification({ type: "new_message" })).toBeNull();
    expect(routeForNotification({ type: "other", conversationId: "c-1" })).toBeNull();
    expect(routeForNotification(null)).toBeNull();
  });
});

describe("getPushToken / registerDevice", () => {
  it("returns null and sends nothing when permission is denied", async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ status: "undetermined" });
    mockNotif.requestPermissionsAsync.mockResolvedValue({ status: "denied" });
    const api = jest.fn() as unknown as Api;
    expect(await registerDevice(api)).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(mockNotif.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it("registers the Expo token with the project id and remembers it", async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockNotif.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[a]" });
    const api = jest.fn().mockResolvedValue({ data: { registered: true } }) as unknown as Api;
    expect(await registerDevice(api)).toBe("ExponentPushToken[a]");
    expect(mockNotif.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: "proj-1" });
    expect(api).toHaveBeenCalledWith("/users/device-token", { method: "POST", body: { token: "ExponentPushToken[a]", platform: expect.any(String) } });
    expect(mockStore["wbmsg.pushToken"]).toBe("ExponentPushToken[a]");
  });

  it("getPushToken never asks the OS twice when already granted", async () => {
    mockNotif.getPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockNotif.getExpoPushTokenAsync.mockResolvedValue({ data: "ExponentPushToken[b]" });
    await getPushToken();
    expect(mockNotif.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("unregister and sign-out", () => {
  it("DELETEs the remembered token with a JSON body and forgets it", async () => {
    mockStore["wbmsg.pushToken"] = "ExponentPushToken[a]";
    const api = jest.fn().mockResolvedValue(undefined) as unknown as Api;
    await unregisterDevice(api);
    expect(api).toHaveBeenCalledWith("/users/device-token", { method: "DELETE", body: { token: "ExponentPushToken[a]" } });
    expect(mockStore["wbmsg.pushToken"]).toBeUndefined();
  });

  it("does nothing when no token was registered", async () => {
    const api = jest.fn() as unknown as Api;
    await unregisterDevice(api);
    expect(api).not.toHaveBeenCalled();
  });

  it("unregisters before signing out, and still signs out if the network call fails", async () => {
    mockStore["wbmsg.pushToken"] = "ExponentPushToken[a]";
    const order: string[] = [];
    const api = jest.fn(async () => { order.push("delete"); throw new Error("offline"); }) as unknown as Api;
    const signOut = jest.fn(async () => { order.push("signOut"); });
    await signOutAndUnregister(api, signOut);
    expect(order).toEqual(["delete", "signOut"]);
    expect(mockStore["wbmsg.pushToken"]).toBeUndefined();
  });
});

describe("permission prompt bookkeeping and badge", () => {
  it("asks once", async () => {
    expect(await shouldAskForPushPermission()).toBe(true);
    await markPushPermissionAsked();
    expect(await shouldAskForPushPermission()).toBe(false);
  });

  it("sets the app badge from the unread-count endpoint and ignores failures", async () => {
    const api = jest.fn().mockResolvedValueOnce({ data: { count: 3 } }).mockRejectedValueOnce(new Error("offline")) as unknown as Api;
    await refreshBadge(api);
    expect(api).toHaveBeenCalledWith("/conversations/unread-count");
    expect(mockNotif.setBadgeCountAsync).toHaveBeenCalledWith(3);
    await expect(refreshBadge(api)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest lib/push.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement the library**

```ts
// apps/mobile/lib/push.ts
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type { Api } from "./api";

const TOKEN_KEY = "wbmsg.pushToken";
const ASKED_KEY = "wbmsg.pushAsked";

/** Where a tapped push should take the user. Contract with the API: data = { type, conversationId?, contactId? }. */
export function routeForNotification(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; conversationId?: unknown; contactId?: unknown };
  if ((d.type === "new_message" || d.type === "conversation_assigned") && typeof d.conversationId === "string") {
    return `/conversation/${d.conversationId}`;
  }
  if (d.type === "closure_overdue" && typeof d.contactId === "string") return `/contact/${d.contactId}`;
  return null;
}

/** Asks the OS only when needed. Null when not a real device, no EAS project id, or permission denied. */
export async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  const projectId: string | undefined =
    Constants.expoConfig?.extra?.["eas"]?.projectId ?? (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  const current = await Notifications.getPermissionsAsync();
  const status = current.status === "granted" ? "granted" : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Messages", importance: Notifications.AndroidImportance.HIGH });
  }
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export async function registerDevice(api: Api): Promise<string | null> {
  const token = await getPushToken();
  if (!token) return null;
  await api("/users/device-token", { method: "POST", body: { token, platform: Platform.OS } });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return token;
}

export async function unregisterDevice(api: Api): Promise<void> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return;
  try {
    await api("/users/device-token", { method: "DELETE", body: { token } });
  } finally {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

/** Shared phones: remove this device from the user's push list first, then end the Clerk session even if offline. */
export async function signOutAndUnregister(api: Api, signOut: () => Promise<unknown>): Promise<void> {
  try {
    await unregisterDevice(api);
  } catch {
    // Offline: the server prunes the token when Expo reports it dead, or when the next user registers this phone.
  }
  await signOut();
}

export async function shouldAskForPushPermission(): Promise<boolean> {
  return (await SecureStore.getItemAsync(ASKED_KEY)) === null;
}

export async function markPushPermissionAsked(): Promise<void> {
  await SecureStore.setItemAsync(ASKED_KEY, "1");
}

export async function refreshBadge(api: Api): Promise<void> {
  try {
    const { data } = await api<{ data: { count: number } }>("/conversations/unread-count");
    await Notifications.setBadgeCountAsync(data.count);
  } catch {
    // Badge is cosmetic; never block the app on it.
  }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm jest lib/push.test.ts` → 11 pass.

- [ ] **Step 5: Permission explainer screen (mockup 1.2)**

```tsx
// apps/mobile/app/(app)/push-permission.tsx
import { useRouter } from "expo-router";
import { Bell } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../lib/api-context";
import { markPushPermissionAsked, registerDevice } from "../../lib/push";
import { colors, font, radius, space } from "../../lib/theme";

const POINTS = [
  ["New messages", "in chats assigned to you"],
  ["Chats assigned", "to you by a teammate or a rule"],
  ["Lead closure reminders", "when a deadline you set is overdue"],
] as const;

export default function PushPermissionScreen() {
  const api = useApi();
  const router = useRouter();

  async function done(enable: boolean) {
    await markPushPermissionAsked();
    if (enable) await registerDevice(api).catch(() => null);
    router.replace("/inbox");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.icon}><Bell color={colors.brand} size={52} /></View>
      <Text style={styles.title} accessibilityRole="header">Never miss a customer</Text>
      <Text style={styles.body}>Turn on notifications so we can tell you the moment a customer writes to you.</Text>
      <View style={styles.card}>
        {POINTS.map(([bold, rest]) => (
          <Text key={bold} style={styles.point}><Text style={styles.bold}>{bold}</Text> {rest}</Text>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={() => void done(true)}>
          <Text style={styles.primaryText}>Turn on notifications</Text>
        </Pressable>
        <Pressable accessibilityRole="button" style={styles.ghost} onPress={() => void done(false)}>
          <Text style={styles.ghostText}>Not now</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: space.xl, gap: space.lg },
  icon: { alignSelf: "center", width: 112, height: 112, borderRadius: 56, backgroundColor: colors.brandSoft, alignItems: "center", justifyContent: "center", marginTop: 64 },
  title: { fontFamily: font.bold, fontSize: 24, color: colors.text, textAlign: "center" },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  card: { backgroundColor: "#F9FAFB", borderRadius: radius.lg, padding: space.lg, gap: space.md },
  point: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, color: colors.text },
  bold: { fontFamily: font.semibold },
  actions: { marginTop: "auto", marginBottom: space.xl, gap: space.sm },
  primary: { height: 52, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  ghost: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  ghostText: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
});
```

- [ ] **Step 6: Wire push into the app layout**

Add to `apps/mobile/app/(app)/_layout.tsx` (merge imports with the existing ones; `useEffect`, `AppState` and `useApi` are already imported from Task 4/6):

```tsx
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { refreshBadge, registerDevice, routeForNotification, shouldAskForPushPermission } from "../../lib/push";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
});

function PushBridge() {
  const api = useApi();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === "granted") await registerDevice(api).catch(() => null);
      else if (status === "undetermined" && (await shouldAskForPushPermission()) && !cancelled) router.push("/push-permission");
      await refreshBadge(api);
      const last = await Notifications.getLastNotificationResponseAsync();
      const route = routeForNotification(last?.notification.request.content.data);
      if (route && !cancelled) router.push(route as never);
    })();

    const tap = Notifications.addNotificationResponseReceivedListener((response) => {
      const route = routeForNotification(response.notification.request.content.data);
      if (route) router.push(route as never);
    });
    const fg = AppState.addEventListener("change", (state) => { if (state === "active") void refreshBadge(api); });
    return () => { cancelled = true; tap.remove(); fg.remove(); };
  }, [api, router]);

  return null;
}
```

Render `<PushBridge />` next to `<RealtimeBridge />` in the `ok` branch only — never for `super_admin`, `no_account` or `error`.

If the installed `expo-notifications` names `getLastNotificationResponseAsync` differently (SDK 57 may expose `useLastNotificationResponse` instead), use the hook form: `const last = Notifications.useLastNotificationResponse();` with an effect that routes when it changes — record the change in the report.

- [ ] **Step 7: Sign out on the Me screen**

Add to `apps/mobile/app/(app)/(tabs)/me.tsx`:

```tsx
import { useAuth } from "@clerk/expo";
import { Pressable } from "react-native";
import { useApi } from "../../../lib/api-context";
import { signOutAndUnregister } from "../../../lib/push";
```

and, inside `MeScreen` after the email line:

```tsx
      <Pressable accessibilityRole="button" style={styles.signOut} onPress={() => void signOutAndUnregister(api, signOut)}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
```

with `const api = useApi(); const { signOut } = useAuth();` at the top of the component and styles:

```ts
  signOut: { minHeight: 48, marginHorizontal: space.xl, marginTop: space.xl, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  signOutText: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
```

- [ ] **Step 8: Verify and commit**

Run: `pnpm jest && pnpm tsc --noEmit && npx expo-doctor && npx expo export --platform android --output-dir dist-check && rm -rf dist-check`
Expected: all mobile tests pass (5 + 5 + 5 + 8 + 11 = 34); clean; doctor OK; export succeeds.

```bash
git add apps/mobile
git commit -m "feat(mobile): push registration, permission explainer, tap-to-open, badge and sign-out unregister

Co-Authored-By: <model that wrote this> <noreply@anthropic.com>"
```

---

## Owner checklist (needs accounts and a phone — not doable by agents)

1. Create an Expo account/organisation and run `cd apps/mobile && npx eas init` → copy the project id into the environment as `EAS_PROJECT_ID`.
2. Set these as EAS environment variables with `eas env:create` (`EXPO_PUBLIC_API_URL` = Railway API URL, `EXPO_PUBLIC_WEB_URL` = Vercel web URL, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` = same Clerk instance as web, `EAS_PROJECT_ID`). `.env*.local` is NOT uploaded to EAS cloud builds; `.env.local` is only for local `expo start`. Builds without these show a "missing configuration" screen.
3. In the Clerk dashboard, confirm the Native API is enabled for the instance (required by `@clerk/expo`).
4. Build a development client: `npx eas build --profile development --platform android` (and/or ios), install it on a phone.
5. Device check: sign in as an agent (email → password → code on first device); see the 4 tabs; Me shows your name; sign in as a super admin → "Super admin accounts use the web dashboard" with a Sign out button; accept notifications; from another phone send a WhatsApp message to a chat assigned to you → push arrives; tap it with the app closed → the Chat placeholder opens; sign out → no more pushes on that phone.
6. Android push: create a Firebase project, download `google-services.json`, upload it as an EAS file env var (`eas env:create --name GOOGLE_SERVICES_JSON --type file ...`), and upload the FCM V1 service-account key to EAS credentials. iOS push needs a paid Apple Developer account (EAS manages the APNs key).
7. Decide PRD §11 Q1 (store publisher): the bundle id `com.conveys.wbmsg` is a placeholder until then.
