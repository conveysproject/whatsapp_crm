import { ClerkProvider, useAuth } from "@clerk/expo";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { ApiProvider } from "../lib/api-context";
import { config } from "../lib/config";
import { missingConfig } from "../lib/config-check";
import { useResetOnUserChange } from "../lib/use-reset-on-user-change";

const configProblems = missingConfig();
if (__DEV__ && configProblems.length) console.warn(`Missing config: ${configProblems.join(", ")}`);

void SplashScreen.preventAutoHideAsync();

const tokenCache = {
  getToken: (key: string) => SecureStore.getItemAsync(key),
  saveToken: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};

/** Drops all cached server data when the signed-in Clerk user changes, so one user's data never shows to the next. */
function UserChangeReset() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  useResetOnUserChange(userId, () => queryClient.clear());
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (!fontsLoaded && !fontError) return null;

  if (!__DEV__ && configProblems.length) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, textAlign: "center" }}>This build is missing configuration: {configProblems.join(", ")}</Text>
      </View>
    );
  }

  return (
    <ClerkProvider publishableKey={config.clerkPublishableKey} tokenCache={tokenCache}>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <UserChangeReset />
          <StatusBar style="dark" />
          <Slot />
        </ApiProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
