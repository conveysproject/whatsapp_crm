import { Check, CheckCheck, Clock, TriangleAlert } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { previewText, type ChatMessage } from "../../lib/conversations";
import { colors, font, space } from "../../lib/theme";

function Ticks({ status }: { status: ChatMessage["status"] }) {
  if (status === "sending") return <Clock size={12} color={colors.textSubtle} />;
  if (status === "failed" || status === "expired" || status === "aborted") return <TriangleAlert size={12} color={colors.danger} />;
  if (status === "read") return <CheckCheck size={14} color="#2563EB" />;
  if (status === "delivered") return <CheckCheck size={14} color={colors.textSubtle} />;
  return <Check size={14} color={colors.textSubtle} />;
}

const STATUS_WORD: Record<ChatMessage["status"], string> = { sending: "sending", sent: "sent", delivered: "delivered", read: "read", failed: "not delivered", expired: "not delivered", aborted: "not delivered" };

export function MessageBubble({ m }: { m: ChatMessage }) {
  if (m.isSystemMessage) return null;
  const out = m.direction === "outbound";
  const isMedia = !m.body && m.contentType !== "text";
  const time = new Date(m.sentAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const text = isMedia ? `[${previewText(m)}]` : m.body;
  const label = `${out ? "You" : "Customer"}: ${text}, ${time}${out ? `, ${STATUS_WORD[m.status] ?? m.status}` : ""}`;
  return (
    <View style={[styles.wrap, out ? styles.right : styles.left]}>
      <View accessible accessibilityLabel={label} style={[styles.bubble, out ? styles.out : styles.in]}>
        {out && m.senderName ? <Text style={styles.sender}>{m.senderName}</Text> : null}
        {m.contentType === "template" ? <Text style={styles.kind}>Template</Text> : null}
        <Text style={[styles.text, isMedia && styles.media]}>{isMedia ? `[${previewText(m)}]` : m.body}</Text>
        <View style={styles.meta}>
          <Text style={styles.time}>{time}</Text>
          {out ? <Ticks status={m.status} /> : null}
        </View>
        {out && m.status === "failed" ? <Text style={styles.failed}>Not delivered</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", paddingHorizontal: space.md, marginVertical: 3 },
  left: { justifyContent: "flex-start" },
  right: { justifyContent: "flex-end" },
  bubble: { maxWidth: "80%", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14 },
  in: { backgroundColor: colors.surface, borderTopLeftRadius: 4 },
  out: { backgroundColor: colors.bubbleOut, borderTopRightRadius: 4 },
  sender: { fontFamily: font.semibold, fontSize: 11, color: colors.brand, marginBottom: 2 },
  kind: { fontFamily: font.semibold, fontSize: 11, color: colors.textMuted, marginBottom: 2 },
  text: { fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  media: { fontStyle: "italic", color: colors.textMuted },
  meta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 4, marginTop: 2 },
  time: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted },
  failed: { fontFamily: font.medium, fontSize: 11, color: colors.danger, marginTop: 2 },
});
