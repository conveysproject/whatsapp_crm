import type { ExpoConfig } from "expo/config";

// Bundle id / package are placeholders until the owner confirms the store publisher (PRD §11 Q1).
const config: ExpoConfig = {
  name: "WBMSG",
  slug: "wbmsg",
  scheme: "wbmsg",
  version: "1.0.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  ios: { bundleIdentifier: "com.conveys.wbmsg", supportsTablet: true },
  android: { package: "com.conveys.wbmsg", adaptiveIcon: { backgroundColor: "#15803D" } },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    "expo-status-bar",
    "expo-splash-screen",
    ["expo-build-properties", { ios: { deploymentTarget: "16.4" }, android: { minSdkVersion: 29 } }],
    ["expo-notifications", { color: "#15803D" }],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env["EAS_PROJECT_ID"] } },
};

export default config;
