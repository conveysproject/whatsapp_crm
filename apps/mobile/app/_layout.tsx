import * as Notifications from "expo-notifications";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function AuthGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuth = segments[0] === "(auth)";
    if (!isSignedIn && !inAuth) router.replace("/(auth)/sign-in");
    if (isSignedIn && inAuth) router.replace("/(tabs)");
  }, [isLoaded, isSignedIn, segments, router]);

  return <Slot />;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  useEffect(() => {
    async function registerForPush() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== "granted") return;
      const token = await Notifications.getExpoPushTokenAsync();
      await fetch(`${process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000"}/v1/users/push-token`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.data, platform: "expo" }),
      });
    }
    registerForPush();
  }, []);

  return (
    <ClerkProvider
      publishableKey={process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]!}
      tokenCache={tokenCache}
    >
      <AuthGuard />
    </ClerkProvider>
  );
}
