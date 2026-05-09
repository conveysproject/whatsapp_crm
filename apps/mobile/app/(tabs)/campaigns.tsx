import { useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";

const API = process.env["EXPO_PUBLIC_API_URL"] ?? "http://localhost:4000";

interface Campaign {
  id: string;
  name: string;
  status: string;
  scheduledAt: string | null;
  _count?: { recipients: number };
}

const STATUS_COLOR: Record<string, string> = {
  draft: "#9ca3af",
  scheduled: "#3b82f6",
  running: "#f59e0b",
  completed: "#16a34a",
  failed: "#ef4444",
  aborted: "#6b7280",
};

const queryClient = new QueryClient();

function CampaignsContent(): JSX.Element {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch } = useQuery<{ data: Campaign[] }>({
    queryKey: ["campaigns-mobile"],
    queryFn: () => fetch(`${API}/v1/campaigns`).then((r) => r.json()),
  });

  const abort = useMutation({
    mutationFn: (id: string) => fetch(`${API}/v1/campaigns/${id}/abort`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns-mobile"] }),
  });

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#fff" }}>
      <Text style={styles.header}>Campaigns</Text>
      <FlatList
        data={data?.data ?? []}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.name}</Text>
              <View style={[styles.badge, { backgroundColor: `${STATUS_COLOR[item.status] ?? "#6b7280"}20` }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] ?? "#6b7280" }]}>{item.status}</Text>
              </View>
            </View>
            {item.scheduledAt && (
              <Text style={styles.meta}>Scheduled: {new Date(item.scheduledAt).toLocaleString("en-IN")}</Text>
            )}
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => {}}>
                <Text style={styles.actionText}>Logs</Text>
              </TouchableOpacity>
              {item.status === "running" && (
                <TouchableOpacity
                  style={[styles.actionBtn, { borderColor: "#ef4444" }]}
                  onPress={() => abort.mutate(item.id)}
                >
                  <Text style={[styles.actionText, { color: "#ef4444" }]}>Abort</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>No campaigns yet.</Text>}
      />
    </View>
  );
}

export default function CampaignsScreen(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <CampaignsContent />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 22, fontWeight: "700", padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  card: { padding: 16, borderBottomWidth: 1, borderColor: "#f0f0f0" },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "600", fontSize: 15, flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  badgeText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  meta: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#d1d5db", borderRadius: 6 },
  actionText: { fontSize: 12, color: "#374151" },
  empty: { textAlign: "center", color: "#9ca3af", padding: 40 },
});
