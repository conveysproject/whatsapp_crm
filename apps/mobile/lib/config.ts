export const config = {
  apiUrl: process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000",
  webUrl: process.env["EXPO_PUBLIC_WEB_URL"] ?? "http://localhost:3000",
  // Store pages for the "Update the app" screen (optional until the store listings exist).
  appStoreUrl: process.env["EXPO_PUBLIC_APP_STORE_URL"] ?? "",
  playStoreUrl: process.env["EXPO_PUBLIC_PLAY_STORE_URL"] ?? "",
};
