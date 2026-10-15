import { ChevronDown, ChevronLeft } from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { contactName, type ConversationItem } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

const STATUS_LABEL: Record<ConversationItem["status"], string> = { open: "Open", pending: "Pending", resolved: "Resolved", bot: "Bot" };
const STATUS_DOT: Record<ConversationItem["status"], string> = { open: "#16A34A", pending: "#D97706", resolved: "#9CA3AF", bot: "#7C3AED" };

export function ChatHeader(props: {
  c: ConversationItem;
  assigneeName: string;
  onBack: () => void;
  onContact: () => void;
  onStatus: () => void;
  onAssign: () => void;
  onLabel: () => void;
}) {
  const { c } = props;
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to inbox" onPress={props.onBack} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Contact details" onPress={props.onContact} disabled={!c.contact} accessibilityState={{ disabled: !c.contact }} style={styles.who}>
          <Text style={styles.name} numberOfLines={1}>{contactName(c.contact)}</Text>
          <Text style={styles.sub} numberOfLines={1}>{c.contact?.phoneNumber ?? ""}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pills}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Status ${STATUS_LABEL[c.status]}, change`} onPress={props.onStatus} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={styles.pill}>
          <View style={[styles.dot, { backgroundColor: STATUS_DOT[c.status] }]} />
          <Text style={styles.pillText}>{STATUS_LABEL[c.status]}</Text><ChevronDown size={12} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Assigned to ${props.assigneeName}, change`} onPress={props.onAssign} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={styles.pill}>
          <Text style={styles.pillText}>Assigned: {props.assigneeName}</Text><ChevronDown size={12} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={c.label ? `Label ${c.label.name}, change` : "Add label"} onPress={props.onLabel} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={styles.pill}>
          <Text style={styles.pillText}>{c.label ? c.label.name : "Add label"}</Text><ChevronDown size={12} color={colors.text} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: space.sm },
  top: { flexDirection: "row", alignItems: "center" },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  who: { flex: 1, minHeight: 44, justifyContent: "center" },
  name: { fontFamily: font.semibold, fontSize: 16, color: colors.text },
  sub: { fontFamily: font.regular, fontSize: 12, color: colors.textMuted },
  pills: { gap: space.sm, paddingHorizontal: space.md },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pillText: { fontFamily: font.semibold, fontSize: 12, color: colors.text },
});
