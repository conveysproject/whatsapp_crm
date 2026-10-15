export const config = {
  apiUrl: process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000",
  webUrl: process.env["EXPO_PUBLIC_WEB_URL"] ?? "http://localhost:3000",
  clerkPublishableKey: process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"] ?? "",
};
