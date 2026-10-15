// apps/mobile/components/SegmentedControl.tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, font, radius } from "../lib/theme";

export function SegmentedControl<T extends string>(props: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; accessibilityLabel: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={props.accessibilityLabel} style={styles.wrap}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => props.onChange(o.value)} style={[styles.item, on && styles.itemOn]}>
            <Text style={[styles.text, on && styles.textOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", gap: 4, padding: 4, borderRadius: radius.md, backgroundColor: colors.border },
  item: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  itemOn: { backgroundColor: colors.surface },
  text: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted },
  textOn: { color: colors.text },
});
