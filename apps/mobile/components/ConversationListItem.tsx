import { Pressable, Text, View, StyleSheet } from "react-native";
import type { MobileConversation } from "../hooks/useConversations";

interface Props {
  conversation: MobileConversation;
  onPress: () => void;
}

export function ConversationListItem({ conversation, onPress }: Props) {
  const time = new Date(conversation.lastMessageAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{(conversation.contactName || "?").charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{conversation.contactName || "Unknown"}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.preview} numberOfLines={1}>{conversation.lastMessageBody}</Text>
          {conversation.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  content: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "600", fontSize: 15, color: "#0f172a", flex: 1 },
  time: { fontSize: 12, color: "#94a3b8", marginLeft: 8 },
  preview: { fontSize: 14, color: "#64748b", flex: 1 },
  badge: { backgroundColor: "#25D366", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
