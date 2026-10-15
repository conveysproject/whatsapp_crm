import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, font, space } from "../lib/theme";

export function Screen({ title, children, scroll = false }: { title?: string; children?: ReactNode; scroll?: boolean }) {
  const Body = scroll ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {title ? <Text style={styles.title} accessibilityRole="header">{title}</Text> : null}
      <Body style={styles.body}>{children}</Body>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  title: { fontFamily: font.bold, fontSize: 28, color: colors.text, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm },
  body: { flex: 1 },
});
