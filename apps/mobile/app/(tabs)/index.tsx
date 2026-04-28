import { FlatList, View, Text, StyleSheet, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useConversations } from "../../hooks/useConversations";
import { ConversationListItem } from "../../components/ConversationListItem";

const queryClient = new QueryClient();

function InboxContent() {
  const { data, isLoading, refetch, isRefetching } = useConversations();
  const router = useRouter();

  if (isLoading) return <View style={styles.center}><Text>Loading…</Text></View>;
  if (!data?.length) return <View style={styles.center}><Text style={styles.empty}>No open conversations</Text></View>;

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ConversationListItem
          conversation={item}
          onPress={() => router.push(`/conversation/${item.id}`)}
        />
      )}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
    />
  );
}

export default function InboxScreen() {
  return (
    <QueryClientProvider client={queryClient}>
      <InboxContent />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { color: "#94a3b8" },
});
