export const config = {
  apiUrl: process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000",
  webUrl: process.env["EXPO_PUBLIC_WEB_URL"] ?? "http://localhost:3000",
  clerkPublishableKey: process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"] ?? "",
  // clerk (default) | wbmsg | auto — see lib/auth/provider.ts
  authProvider: process.env["EXPO_PUBLIC_AUTH_PROVIDER"] ?? "clerk",
  // Store pages for the "Update the app" screen (optional until the store listings exist).
  appStoreUrl: process.env["EXPO_PUBLIC_APP_STORE_URL"] ?? "",
  playStoreUrl: process.env["EXPO_PUBLIC_PLAY_STORE_URL"] ?? "",
};
