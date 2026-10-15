import { Pressable, StyleSheet, Text, View } from "react-native";
import { contactName, previewText, type ConversationItem } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

const STATUS: Record<ConversationItem["status"], { label: string; bg: string; fg: string }> = {
  open: { label: "Open", bg: "#DCFCE7", fg: "#166534" },
  pending: { label: "Pending", bg: "#FEF3C7", fg: "#92400E" },
  resolved: { label: "Resolved", bg: "#F3F4F6", fg: "#374151" },
  bot: { label: "Bot", bg: "#EDE9FE", fg: "#5B21B6" },
};

function initials(name: string): string {
  const parts = name.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "#";
}

function timeLabel(iso: string | null, now: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  const mins = Math.floor((now - t) / 60_000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const d = new Date(t);
  const today = new Date(now);
  if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function ConversationRow({ item, assigneeName, onPress, now }: { item: ConversationItem; assigneeName: string; onPress: () => void; now: number }) {
  const name = contactName(item.contact);
  const st = STATUS[item.status];
  const unread = item.unreadCount > 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${unread ? `${item.unreadCount} unread, ` : ""}${previewText(item.lastMessage)}`} onPress={onPress} style={styles.row}>
      <View style={styles.avatar}><Text style={styles.avatarText}>{initials(name)}</Text></View>
      <View style={styles.body}>
        <View style={styles.line}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={[styles.time, unread && styles.timeUnread]}>{timeLabel(item.lastMessageAt, now)}</Text>
        </View>
        <View style={styles.line}>
          <Text style={styles.preview} numberOfLines={1}>{previewText(item.lastMessage)}</Text>
          {unread ? <View style={styles.badge}><Text style={styles.badgeText}>{item.unreadCount}</Text></View> : null}
        </View>
        <View style={styles.tags}>
          <Text style={[styles.tag, { backgroundColor: st.bg, color: st.fg }]}>{st.label}</Text>
          {item.label ? <Text style={[styles.tag, { backgroundColor: `${item.label.color}22`, color: colors.text }]}>{item.label.name}</Text> : null}
          {!item.serviceWindowActive ? <Text style={[styles.tag, { backgroundColor: colors.warningSoft, color: colors.warning }]}>24h window closed</Text> : null}
          <Text style={styles.assignee}>{assigneeName}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: "#F3F4F6", backgroundColor: colors.surface },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#E0E7FF", alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: font.semibold, fontSize: 16, color: "#3730A3" },
  body: { flex: 1, minWidth: 0, gap: 3 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  name: { flex: 1, fontFamily: font.semibold, fontSize: 16, color: colors.text },
  time: { fontFamily: font.medium, fontSize: 12, color: colors.textSubtle },
  timeUnread: { color: colors.brand },
  preview: { flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  badgeText: { fontFamily: font.semibold, fontSize: 12, color: "#FFFFFF" },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  tag: { fontFamily: font.semibold, fontSize: 11, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  assignee: { fontFamily: font.regular, fontSize: 11, color: colors.textSubtle },
});
