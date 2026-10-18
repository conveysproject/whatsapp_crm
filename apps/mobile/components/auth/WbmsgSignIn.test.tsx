// Full-screen flow tests render the real React Native tree; the first one pays the cold-start cost,
// which exceeds jest's 5 s default on slower CI runners.
jest.setTimeout(30_000);

const mockStore: Record<string, string> = {};
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  deleteItemAsync: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
jest.mock("expo-constants", () => ({ __esModule: true, default: { expoConfig: { version: "1.0.0" } } }));
jest.mock("@clerk/expo", () => ({ ClerkProvider: () => null, useAuth: () => ({}) }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});

import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { wbmsgSession } from "../../lib/auth";
import { WbmsgSignIn } from "./WbmsgSignIn";

function b64url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const ACCESS = `${b64url("{}")}.${b64url(JSON.stringify({ sub: "usr_1" }))}.sig`;

type Route = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => { status: number; body: unknown };
function mockApi(route: Route) {
  const fn = jest.fn(async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    const r = route(url, init);
    return { status: r.status, ok: r.status < 300, json: async () => r.body };
  });
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

beforeEach(async () => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  await wbmsgSession().store.restore();
});

async function enterEmailAndPassword() {
  await fireEvent.changeText(screen.getByLabelText("Work email"), "a@b.co");
  await fireEvent.press(screen.getByText("Continue"));
  await fireEvent.changeText(screen.getByLabelText("Password"), "pw-123456");
  await fireEvent.press(screen.getByText("Sign in"));
}

describe("WbmsgSignIn", () => {
  it("email → password → new-device code → signed in, keeping the device id", async () => {
    const fetchFn = mockApi((url) => {
      if (url.endsWith("/auth/signin/password")) return { status: 200, body: { next: "new_device", challengeId: "ch1" } };
      if (url.endsWith("/auth/signin/new-device")) return { status: 200, body: { accessToken: ACCESS, refreshToken: "r1", expiresIn: 600, deviceId: "dev_1" } };
      if (url.endsWith("/users/me")) return { status: 200, body: { data: { role: "agent" } } };
      return { status: 404, body: null };
    });
    await render(<WbmsgSignIn />);
    await enterEmailAndPassword();
    await screen.findByText(/new device/);
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "123456");
    await fireEvent.press(screen.getByText("Verify"));
    await waitFor(() => expect(wbmsgSession().store.getState()).toEqual({ status: "signed_in", userId: "usr_1" }));
    expect(mockStore["wbmsg.auth.device"]).toBe("dev_1");
    expect(mockStore["wbmsg.auth.refresh"]).toBe("r1");
    const newDevice = fetchFn.mock.calls.find((c) => c[0].endsWith("/new-device"))!;
    expect(JSON.parse(newDevice[1].body!)).toEqual({ challengeId: "ch1", code: "123456", client: "mobile" });
  });

  it("set_password: code + new password through the reset flow", async () => {
    const fetchFn = mockApi((url) => {
      if (url.endsWith("/auth/signin/password")) return { status: 200, body: { next: "set_password", challengeId: "ch2" } };
      if (url.endsWith("/auth/password/reset")) return { status: 200, body: { accessToken: ACCESS, refreshToken: "r1", expiresIn: 600, deviceId: "d" } };
      if (url.endsWith("/users/me")) return { status: 200, body: { data: { role: "admin" } } };
      return { status: 404, body: null };
    });
    await render(<WbmsgSignIn />);
    await enterEmailAndPassword();
    await screen.findByText("Set your password");
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "654321");
    await fireEvent.changeText(screen.getByLabelText("New password"), "a new long password");
    await fireEvent.press(screen.getByText("Set password and sign in"));
    await waitFor(() => expect(wbmsgSession().store.getState().status).toBe("signed_in"));
    const reset = fetchFn.mock.calls.find((c) => c[0].endsWith("/password/reset"))!;
    expect(JSON.parse(reset[1].body!)).toEqual({ email: "a@b.co", code: "654321", newPassword: "a new long password", client: "mobile" });
  });

  it("super admins are signed out again and told to use the web", async () => {
    const fetchFn = mockApi((url) => {
      if (url.endsWith("/auth/signin/code/request")) return { status: 202, body: { ok: true } };
      if (url.endsWith("/auth/signin/code/verify")) return { status: 200, body: { accessToken: ACCESS, refreshToken: "r1", expiresIn: 600, deviceId: "d" } };
      if (url.endsWith("/users/me")) return { status: 200, body: { data: { role: "superAdmin" } } };
      if (url.endsWith("/auth/signout")) return { status: 200, body: { ok: true } };
      return { status: 404, body: null };
    });
    await render(<WbmsgSignIn />);
    await fireEvent.changeText(screen.getByLabelText("Work email"), "root@b.co");
    await fireEvent.press(screen.getByText("Email me a code"));
    await screen.findByText(/sign-in code/);
    await fireEvent.changeText(screen.getByLabelText("6-digit code"), "111111");
    await fireEvent.press(screen.getByText("Sign in"));
    await screen.findByText("Use the web dashboard");
    expect(wbmsgSession().store.getState().status).toBe("signed_out");
    expect(mockStore["wbmsg.auth.refresh"]).toBeUndefined();
    const signout = fetchFn.mock.calls.find((c) => c[0].endsWith("/auth/signout"))!;
    expect(signout[1].headers.Authorization).toBe(`Bearer ${ACCESS}`);
  });

  it("shows the API's error for a wrong password", async () => {
    mockApi(() => ({ status: 401, body: { error: { code: "INVALID_CREDENTIALS", message: "Email or password is incorrect." } } }));
    await render(<WbmsgSignIn />);
    await enterEmailAndPassword();
    await screen.findByText("Email or password is incorrect.");
    expect(wbmsgSession().store.getState().status).toBe("signed_out");
  });

  it("links to sign-up on the web instead of signing up in the app", async () => {
    await render(<WbmsgSignIn />);
    expect(screen.getByText("Create an account on the web")).toBeTruthy();
  });
});
