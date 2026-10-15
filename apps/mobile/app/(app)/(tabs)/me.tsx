import { useAuth } from "@clerk/expo";
import { Pressable, StyleSheet, Text } from "react-native";
import { Screen } from "../../../components/Screen";
import { useApi } from "../../../lib/api-context";
import { useMe } from "../../../lib/me-context";
import { signOutAndUnregister } from "../../../lib/push";
import { colors, font, space } from "../../../lib/theme";

export default function MeScreen() {
  const me = useMe();
  const api = useApi();
  const { signOut } = useAuth();
  return (
    <Screen title="Me">
      <Text style={styles.name}>{me.fullName}</Text>
      <Text style={styles.sub}>{me.email}</Text>
      <Pressable accessibilityRole="button" style={styles.signOut} onPress={() => void signOutAndUnregister(api, signOut)}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.semibold, fontSize: 17, color: colors.text, paddingHorizontal: space.xl },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, paddingHorizontal: space.xl, marginTop: space.xs },
  signOut: { minHeight: 48, marginHorizontal: space.xl, marginTop: space.xl, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  signOutText: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
});
