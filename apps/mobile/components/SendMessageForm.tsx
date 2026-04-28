import { useState } from "react";
import { View, TextInput, Pressable, StyleSheet } from "react-native";
import { Send } from "lucide-react-native";

interface Props {
  onSend: (body: string) => void;
  isLoading: boolean;
}

export function SendMessageForm({ onSend, isLoading }: Props) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder="Type a message..."
        multiline
        maxLength={4096}
      />
      <Pressable style={[styles.button, (!text.trim() || isLoading) && styles.disabled]} onPress={handleSend}>
        <Send size={20} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderTopColor: "#e2e8f0", backgroundColor: "#fff", alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 100, marginRight: 8 },
  button: { backgroundColor: "#25D366", width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.5 },
});
