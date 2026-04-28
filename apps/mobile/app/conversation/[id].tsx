import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, View, Text } from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMessages } from "../../hooks/useMessages";
import { useSendMessage } from "../../hooks/useSendMessage";
import { MessageBubble } from "../../components/MessageBubble";
import { SendMessageForm } from "../../components/SendMessageForm";

const queryClient = new QueryClient();

function ConversationContent({ id }: { id: string }) {
  const navigation = useNavigation();
  const { data: messages, isLoading } = useMessages(id);
  const send = useSendMessage(id);

  useEffect(() => { navigation.setOptions({ title: "Conversation" }); }, [navigation]);

  if (isLoading) return <View style={styles.center}><Text>Loading…</Text></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={styles.list}
      />
      <SendMessageForm onSend={(body) => send.mutate(body)} isLoading={send.isPending} />
    </KeyboardAvoidingView>
  );
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <QueryClientProvider client={queryClient}>
      <ConversationContent id={id} />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingVertical: 8 },
});
