import { ChevronDown } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { InboxTab, QuickFilter } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

const TABS: { id: InboxTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "pending", label: "Pending" },
  { id: "closed", label: "Closed" },
];

export function FilterBar(props: {
  tab: InboxTab;
  onTab: (t: InboxTab) => void;
  quick: QuickFilter | null;
  onQuick: (q: QuickFilter | null) => void;
  labelName: string | null;
  onLabelPress: () => void;
}) {
  return (
    <View>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {TABS.map((t) => {
          const on = props.tab === t.id;
          return (
            <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => props.onTab(t.id)} style={[styles.tab, on && styles.tabOn]}>
              <Text style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(["unread", "assigned"] as const).map((q) => {
          const on = props.quick === q;
          return (
            <Pressable key={q} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => props.onQuick(on ? null : q)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{q === "unread" ? "Unread" : "Assigned to me"}</Text>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" accessibilityLabel={props.labelName ? `Label: ${props.labelName}, change` : "Filter by label"} accessibilityState={{ selected: !!props.labelName }} onPress={props.onLabelPress} style={[styles.chip, props.labelName ? styles.chipOn : null]}>
          <Text style={[styles.chipText, props.labelName ? styles.chipTextOn : null]}>{props.labelName ?? "Filter by label"}</Text>
          <ChevronDown size={14} color={props.labelName ? "#FFFFFF" : colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center" },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabText: { fontFamily: font.semibold, fontSize: 14, color: colors.textMuted },
  tabTextOn: { color: colors.brand },
  chips: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: space.lg, borderRadius: 22, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  chipTextOn: { color: "#FFFFFF" },
});
