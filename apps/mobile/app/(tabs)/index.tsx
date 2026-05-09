import { useState } from "react";
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";

const API = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Conversation {
  id: string;
  contact: { firstName: string | null; lastName: string | null; phone: string };
  lastMessage: { body: string; createdAt: string } | null;
}

interface Message {
  id: string;
  body: string;
  direction: string;
  createdAt: string;
}

const queryClient = new QueryClient();

function InboxContent(): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState("");
  const qc = useQueryClient();

  const { data: convos } = useQuery<{ data: Conversation[] }>({
    queryKey: ["conversations"],
    queryFn: () => fetch(`${API}/v1/conversations`).then((r) => r.json()),
  });

  const { data: messages } = useQuery<{ data: Message[] }>({
    queryKey: ["messages", selectedId],
    queryFn: () => fetch(`${API}/v1/messages?conversationId=${selectedId}`).then((r) => r.json()),
    enabled: !!selectedId,
    refetchInterval: 3000,
  });

  const send = useMutation({
    mutationFn: (body: string) =>
      fetch(`${API}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, body, direction: "outbound" }),
      }).then((r) => r.json()),
    onSuccess: () => {
      setMessageText("");
      qc.invalidateQueries({ queryKey: ["messages", selectedId] });
    },
  });

  if (!selectedId) {
    return (
      <FlatList
        data={convos?.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => setSelectedId(item.id)}>
            <Text style={styles.name}>{[item.contact.firstName, item.contact.lastName].filter(Boolean).join(" ") || item.contact.phone}</Text>
            <Text style={styles.preview} numberOfLines={1}>{item.lastMessage?.body ?? ""}</Text>
          </TouchableOpacity>
        )}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>
      <FlatList
        data={messages?.data ?? []}
        keyExtractor={(item) => item.id}
        inverted
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.direction === "outbound" ? styles.outbound : styles.inbound]}>
            <Text style={styles.bubbleText}>{item.body}</Text>
          </View>
        )}
        style={{ flex: 1 }}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={messageText}
          onChangeText={setMessageText}
          placeholder="Type a message..."
          multiline
        />
        <TouchableOpacity onPress={() => messageText && send.mutate(messageText)} style={styles.sendBtn}>
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function InboxScreen(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <InboxContent />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  row: { padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  name: { fontWeight: "600", fontSize: 15 },
  preview: { color: "#666", fontSize: 13, marginTop: 2 },
  back: { padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  backText: { color: "#16a34a", fontWeight: "600" },
  bubble: { maxWidth: "75%", margin: 8, padding: 10, borderRadius: 12 },
  outbound: { alignSelf: "flex-end", backgroundColor: "#dcfce7" },
  inbound: { alignSelf: "flex-start", backgroundColor: "#f3f4f6" },
  bubbleText: { fontSize: 14 },
  composer: { flexDirection: "row", padding: 12, borderTopWidth: 1, borderColor: "#e5e7eb", alignItems: "flex-end" },
  input: { flex: 1, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, fontSize: 14, maxHeight: 100 },
  sendBtn: { marginLeft: 8, backgroundColor: "#16a34a", paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  sendText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
