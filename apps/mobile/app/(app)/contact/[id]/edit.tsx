// apps/mobile/app/(app)/contact/[id]/edit.tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../../lib/api-context";
import { contactSaveError } from "../../../../lib/dashboard";
import { colors, font, radius, space } from "../../../../lib/theme";

export default function EditContactScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const contact = useQuery({ queryKey: ["contacts", "detail", id], queryFn: async () => (await api<{ data: { firstName: string | null; lastName: string | null; email: string | null } }>(`/contacts/${id}`)).data });
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (contact.data) setForm({ firstName: contact.data.firstName ?? "", lastName: contact.data.lastName ?? "", email: contact.data.email ?? "" }); }, [contact.data]);
  const save = useMutation({
    mutationFn: () => api(`/contacts/${id}`, { method: "PATCH", body: { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim() || null } }),
    onMutate: () => setError(null),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["contacts"] }); void qc.invalidateQueries({ queryKey: ["conversations"] }); router.back(); },
    onError: (e) => setError(contactSaveError(e)),
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.side}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title} accessibilityRole="header">Edit contact</Text>
        <Pressable accessibilityRole="button" disabled={save.isPending || !contact.data} onPress={() => save.mutate()} style={styles.side}>
          {save.isPending ? <ActivityIndicator color={colors.brand} /> : <Text style={styles.save}>Save</Text>}
        </Pressable>
      </View>
      {contact.isLoading ? <ActivityIndicator color={colors.brand} /> : (
        <View style={styles.body}>
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {([["firstName", "First name"], ["lastName", "Last name"], ["email", "Email"]] as const).map(([k, label]) => (
            <View key={k} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput value={form[k]} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} accessibilityLabel={label} keyboardType={k === "email" ? "email-address" : "default"} autoCapitalize={k === "email" ? "none" : "words"} style={styles.input} />
            </View>
          ))}
          <Text style={styles.hint}>The phone number can't be changed here.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  head: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.sm },
  side: { minWidth: 72, minHeight: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, textAlign: "center", fontFamily: font.semibold, fontSize: 16, color: colors.text },
  cancel: { fontFamily: font.regular, fontSize: 15, color: colors.text },
  save: { fontFamily: font.semibold, fontSize: 15, color: colors.brand },
  body: { padding: space.lg, gap: space.lg },
  field: { gap: 6 },
  label: { fontFamily: font.medium, fontSize: 14, color: colors.text },
  input: { height: 48, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, fontFamily: font.regular, fontSize: 16, color: colors.text },
  hint: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
  error: { fontFamily: font.medium, fontSize: 14, color: colors.danger },
});
