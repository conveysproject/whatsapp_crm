import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Slot } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { UpdateRequired } from "../components/auth/UpdateRequired";
import { ApiProvider } from "../lib/api-context";
import { useUpgradeRequired } from "../lib/app-headers";
import { AuthProvider, useAuth } from "../lib/auth";
import { missingConfig } from "../lib/config-check";
import { useResetOnUserChange } from "../lib/use-reset-on-user-change";

const configProblems = missingConfig();
if (__DEV__ && configProblems.length) console.warn(`Missing config: ${configProblems.join(", ")}`);

void SplashScreen.preventAutoHideAsync();

/** Drops all cached server data when the signed-in user changes, so one user's data never shows to the next. */
function UserChangeReset() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  useResetOnUserChange(userId, () => queryClient.clear());
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: 1 } } }));
  const upgradeRequired = useUpgradeRequired();

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

  // The API turned this build away (426): nothing else works until the app is updated.
  if (upgradeRequired) return <UpdateRequired />;

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <UserChangeReset />
          <StatusBar style="dark" />
          <Slot />
        </ApiProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
