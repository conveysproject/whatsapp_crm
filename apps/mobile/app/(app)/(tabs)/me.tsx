import { StyleSheet, Text } from "react-native";
import { Screen } from "../../../components/Screen";
import { useMe } from "../../../lib/me-context";
import { colors, font, space } from "../../../lib/theme";

export default function MeScreen() {
  const me = useMe();
  return (
    <Screen title="Me">
      <Text style={styles.name}>{me.fullName}</Text>
      <Text style={styles.sub}>{me.email}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { fontFamily: font.semibold, fontSize: 17, color: colors.text, paddingHorizontal: space.xl },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted, paddingHorizontal: space.xl, marginTop: space.xs },
});
