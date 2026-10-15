// apps/mobile/app/(app)/contact/[id]/index.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { OptionSheet } from "../../../../components/OptionSheet";
import { ApiError } from "../../../../lib/api";
import { useApi } from "../../../../lib/api-context";
import { colors, font, radius, space } from "../../../../lib/theme";

interface Contact {
  id: string; firstName: string | null; lastName: string | null; name: string | null; phoneNumber: string; email: string | null;
  tags: string[]; notes: string | null; disableBot: boolean; waBlockedAt: string | null; createdAt: string;
  leadStatus: { id: string; name: string; color: string } | null; groupIds: string[]; customFields: Record<string, unknown>;
  assignedUser: { id: string; fullName: string } | null; country: { name: string } | null;
}
interface Named { id: string; name: string; color?: string }

function editError(e: unknown): string {
  return e instanceof ApiError && e.status === 403 ? "You don't have permission to edit contacts." : "Couldn't save. Check your connection and try again.";
}

export default function ContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ["contacts", "detail", id] as const;
  const contact = useQuery({ queryKey: key, queryFn: async () => (await api<{ data: Contact }>(`/contacts/${id}`)).data });
  const deals = useQuery({ queryKey: ["deals", "contact", id], queryFn: () => api<{ data: { id: string; title: string; value: string | null; stage: string }[] }>(`/deals?contactId=${id}`), retry: false });
  const statuses = useQuery({ queryKey: ["lead-statuses"], queryFn: () => api<{ data: Named[] }>("/lead-statuses"), staleTime: 10 * 60_000 });
  const groups = useQuery({ queryKey: ["contact-groups"], queryFn: () => api<{ data: { id: string; title: string }[] }>("/contact-groups"), staleTime: 10 * 60_000, retry: false });
  const fields = useQuery({ queryKey: ["custom-fields"], queryFn: () => api<{ data: { fieldKey: string; inputName: string }[] }>("/contacts/custom-fields"), staleTime: 10 * 60_000, retry: false });

  const [notes, setNotes] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  useEffect(() => { if (contact.data) setNotes(contact.data.notes ?? ""); }, [contact.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ["contacts"] }); };
  const patch = useMutation({ mutationFn: (body: { tags?: string[]; leadStatusId?: string }) => api(`/contacts/${id}`, { method: "PATCH", body }), onMutate: () => setError(null), onSuccess: () => { refresh(); void qc.invalidateQueries({ queryKey: ["conversations"] }); }, onError: (e) => setError(editError(e)) });
  const saveNotes = useMutation({ mutationFn: (n: string) => api(`/contacts/${id}/notes`, { method: "PUT", body: { notes: n } }), onMutate: () => { setError(null); setSaved(false); }, onSuccess: () => { setSaved(true); refresh(); }, onError: (e) => setError(editError(e)) });
  const toggleBot = useMutation({ mutationFn: (disabled: boolean) => api(`/contacts/${id}/toggle-bot`, { method: "POST", body: { disabled } }), onMutate: () => setError(null), onSuccess: refresh, onError: (e) => setError(editError(e)) });
  const block = useMutation({ mutationFn: (on: boolean) => api(`/contacts/${id}/${on ? "block" : "unblock"}`, { method: "POST" }), onMutate: () => setError(null), onSuccess: refresh, onError: (e) => setError(editError(e)) });

  if (contact.isLoading) return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  if (!contact.data) {
    const noAccess = contact.error instanceof ApiError && (contact.error.status === 404 || contact.error.status === 403);
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.stateTitle}>{noAccess ? "You don't have access to this contact" : "Couldn't load this contact"}</Text>
        <Pressable accessibilityRole="button" onPress={() => (noAccess ? router.back() : void contact.refetch())} style={styles.primary}><Text style={styles.primaryText}>{noAccess ? "Back" : "Try again"}</Text></Pressable>
      </SafeAreaView>
    );
  }
  const c = contact.data;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || c.phoneNumber;
  const groupNames = (groups.data?.data ?? []).filter((g) => c.groupIds.includes(g.id)).map((g) => g.title);
  // Web keys contact.customFields by the field label (inputName); fall back to fieldKey.
  const cfValue = (f: { fieldKey: string; inputName: string }): unknown => c.customFields?.[f.inputName] ?? c.customFields?.[f.fieldKey];
  const customRows = (fields.data?.data ?? []).filter((f) => { const v = cfValue(f); return v !== undefined && v !== null && v !== ""; });
  const blocked = c.waBlockedAt !== null;

  function addTag() {
    const t = tagDraft.trim();
    if (!t || c.tags.includes(t)) return;
    patch.mutate({ tags: [...c.tags, t] });
    setTagDraft("");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={styles.icon}><ChevronLeft size={26} color={colors.text} /></Pressable>
        <Text style={styles.headTitle} accessibilityRole="header">Contact Details</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/contact/[id]/edit", params: { id } })} style={styles.icon}><Text style={{ fontFamily: font.semibold, fontSize: 15, color: colors.brand }}>Edit</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.sub}>{c.phoneNumber}{c.country ? ` · ${c.country.name}` : ""}</Text>
        </View>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

        <Text style={styles.sec}>DETAILS</Text>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" onPress={() => setStatusOpen(true)} style={styles.row}><Text style={styles.k}>Lead status</Text><Text style={styles.v}>{c.leadStatus?.name ?? "None"}</Text></Pressable>
          <View style={styles.row}><Text style={styles.k}>Assigned to</Text><Text style={styles.v}>{c.assignedUser?.fullName ?? "Nobody"}</Text></View>
          {c.email ? <View style={styles.row}><Text style={styles.k}>Email</Text><Text style={styles.v}>{c.email}</Text></View> : null}
          {groupNames.length ? <View style={styles.row}><Text style={styles.k}>Groups</Text><Text style={styles.v}>{groupNames.join(", ")}</Text></View> : null}
          <View style={styles.row}><Text style={styles.k}>First contact</Text><Text style={styles.v}>{new Date(c.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</Text></View>
        </View>

        <Text style={styles.sec}>TAGS</Text>
        <View style={styles.tags}>
          {c.tags.map((t) => (
            <Pressable key={t} accessibilityRole="button" accessibilityLabel={`Remove tag ${t}`} disabled={patch.isPending} onPress={() => patch.mutate({ tags: c.tags.filter((x) => x !== t) })} style={[styles.tag, patch.isPending && styles.disabled]}>
              <Text style={styles.tagText}>{t}</Text><X size={12} color={colors.textMuted} />
            </Pressable>
          ))}
          <TextInput value={tagDraft} onChangeText={setTagDraft} onSubmitEditing={addTag} placeholder="Add tag…" accessibilityLabel="Add tag" editable={!patch.isPending} returnKeyType="done" autoCapitalize="none" style={styles.tagInput} />
        </View>

        {customRows.length ? (
          <>
            <Text style={styles.sec}>CUSTOM FIELDS</Text>
            <View style={styles.card}>
              {customRows.map((f) => <View key={f.fieldKey} style={styles.row}><Text style={styles.k}>{f.inputName}</Text><Text style={styles.v}>{String(cfValue(f))}</Text></View>)}
            </View>
          </>
        ) : null}

        <Text style={styles.sec}>NOTES</Text>
        <View style={[styles.card, { padding: space.md }]}>
          <TextInput value={notes} onChangeText={(t) => { setNotes(t); setSaved(false); }} placeholder="Add a note…" accessibilityLabel="Notes" multiline style={styles.notes} />
          <View style={styles.notesBar}>
            {saved ? <Text style={styles.saved}>Saved</Text> : null}
            <Pressable accessibilityRole="button" disabled={saveNotes.isPending || notes === (c.notes ?? "")} onPress={() => saveNotes.mutate(notes)} style={[styles.small, (saveNotes.isPending || notes === (c.notes ?? "")) && styles.disabled]}>
              <Text style={styles.smallText}>Save note</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.sec}>DEALS</Text>
        <View style={styles.card}>
          {(deals.data?.data ?? []).length === 0 ? <View style={styles.row}><Text style={styles.k}>{deals.error ? "Deals aren't available for your role." : "No deals yet"}</Text></View> : (deals.data?.data ?? []).map((d) => (
            <View key={d.id} style={styles.row}><Text style={[styles.k, { color: colors.text }]}>{d.title}</Text><Text style={styles.v}>{d.stage}{d.value ? ` · ${d.value}` : ""}</Text></View>
          ))}
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={[styles.k, { color: colors.text }]}>Bot replies for this contact</Text>
            <Switch accessibilityLabel="Bot replies for this contact" value={!c.disableBot} disabled={toggleBot.isPending} onValueChange={(on) => toggleBot.mutate(!on)} trackColor={{ true: colors.brand, false: "#D1D5DB" }} />
          </View>
          <Pressable accessibilityRole="button" disabled={block.isPending} onPress={() => Alert.alert(blocked ? "Unblock this contact?" : "Block this contact?", undefined, [{ text: "Cancel", style: "cancel" }, { text: blocked ? "Unblock" : "Block", style: "destructive", onPress: () => block.mutate(!blocked) }])} style={styles.row}>
            <Text style={styles.danger}>{blocked ? "Unblock contact" : "Block contact"}</Text>
          </Pressable>
        </View>
      </ScrollView>
      <OptionSheet
        visible={statusOpen}
        title="Lead status"
        options={(statuses.data?.data ?? []).map((st) => ({ label: st.name, value: st.id }))}
        onSelect={(v) => patch.mutate({ leadStatusId: v })}
        onClose={() => setStatusOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  head: { flexDirection: "row", alignItems: "center", backgroundColor: colors.background },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headTitle: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  body: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  hero: { alignItems: "center", gap: 4 },
  name: { fontFamily: font.bold, fontSize: 22, color: colors.text },
  sub: { fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  sec: { fontFamily: font.semibold, fontSize: 13, color: colors.textMuted, letterSpacing: 0.5, marginTop: space.sm },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingHorizontal: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  k: { flex: 1, fontFamily: font.regular, fontSize: 14, color: colors.textMuted },
  v: { fontFamily: font.medium, fontSize: 14, color: colors.text, flexShrink: 1, textAlign: "right" },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" },
  tag: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tagText: { fontFamily: font.semibold, fontSize: 13, color: colors.text },
  tagInput: { minWidth: 110, minHeight: 44, paddingHorizontal: space.md, borderRadius: 22, borderWidth: 1, borderStyle: "dashed", borderColor: colors.brand, fontFamily: font.regular, fontSize: 13 },
  notes: { minHeight: 80, fontFamily: font.regular, fontSize: 15, lineHeight: 21, color: colors.text, textAlignVertical: "top" },
  notesBar: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.md },
  saved: { fontFamily: font.semibold, fontSize: 12, color: colors.brand },
  small: { minHeight: 44, paddingHorizontal: space.md, borderRadius: radius.sm, backgroundColor: colors.brand, justifyContent: "center" },
  smallText: { fontFamily: font.semibold, fontSize: 13, color: "#FFFFFF" },
  disabled: { opacity: 0.5 },
  danger: { fontFamily: font.semibold, fontSize: 15, color: colors.danger },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl, backgroundColor: colors.surface },
  stateTitle: { fontFamily: font.bold, fontSize: 18, color: colors.text, textAlign: "center" },
  primary: { minHeight: 48, paddingHorizontal: space.xl, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
});
