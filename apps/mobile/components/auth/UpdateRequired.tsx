import { Linking, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { config } from "../../lib/config";
import { signInStyles as styles } from "./sign-in-styles";

/** Shown app-wide once the API answers 426 UPGRADE_REQUIRED (this build is older than the minimum version). */
export function UpdateRequired() {
  const storeUrl = Platform.OS === "ios" ? config.appStoreUrl : config.playStoreUrl;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <View style={styles.logo}><Text style={styles.logoText}>W</Text></View>
        <Text style={styles.title} accessibilityRole="header">Update the app</Text>
        <Text style={styles.subtitle}>
          This version of WBMSG is no longer supported. Install the latest version from the {Platform.OS === "ios" ? "App Store" : "Play Store"} to keep using the app.
        </Text>
        {storeUrl ? (
          <Pressable accessibilityRole="link" style={styles.primary} onPress={() => void Linking.openURL(storeUrl)}>
            <Text style={styles.primaryText}>Update now</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="link" style={styles.ghost} onPress={() => void Linking.openURL(config.webUrl)}>
          <Text style={styles.ghostText}>Open web dashboard</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
