import { View, Text, StyleSheet } from "react-native";
import type { MobileMessage } from "../hooks/useMessages";

interface Props { message: MobileMessage }

export function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === "outbound";
  return (
    <View style={[styles.wrapper, isOutbound ? styles.outboundWrapper : styles.inboundWrapper]}>
      <View style={[styles.bubble, isOutbound ? styles.outboundBubble : styles.inboundBubble]}>
        {message.contentType === "audio" ? (
          <Text style={[styles.text, isOutbound && styles.outboundText]}>
            {"🎵"} Voice message{message.body ? `\n"${message.body}"` : ""}
          </Text>
        ) : (
          <Text style={[styles.text, isOutbound && styles.outboundText]}>{message.body ?? ""}</Text>
        )}
        <Text style={[styles.time, isOutbound && styles.outboundTime]}>
          {new Date(message.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 12, paddingVertical: 4 },
  inboundWrapper: { alignItems: "flex-start" },
  outboundWrapper: { alignItems: "flex-end" },
  bubble: { maxWidth: "75%", padding: 10, borderRadius: 12 },
  inboundBubble: { backgroundColor: "#f1f5f9", borderBottomLeftRadius: 4 },
  outboundBubble: { backgroundColor: "#25D366", borderBottomRightRadius: 4 },
  text: { fontSize: 15, color: "#0f172a" },
  outboundText: { color: "#fff" },
  time: { fontSize: 11, color: "#94a3b8", marginTop: 4, textAlign: "right" },
  outboundTime: { color: "rgba(255,255,255,0.7)" },
});
