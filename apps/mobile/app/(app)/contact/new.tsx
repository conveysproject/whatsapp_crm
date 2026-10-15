// apps/mobile/app/(app)/contact/new.tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useApi } from "../../../lib/api-context";
import { contactSaveError } from "../../../lib/dashboard";
import { colors, font, radius, space } from "../../../lib/theme";

export default function NewContactScreen() {
  const api = useApi();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: "", lastName: "", phoneNumber: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () => api<{ data: { id: string } }>("/contacts", {
      method: "POST",
      body: {
        phoneNumber: form.phoneNumber.replace(/\D/g, ""),
        ...(form.firstName.trim() ? { firstName: form.firstName.trim() } : {}),
        ...(form.lastName.trim() ? { lastName: form.lastName.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      },
    }),
    onMutate: () => setError(null),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ["contacts"] }); router.replace({ pathname: "/contact/[id]", params: { id: r.data.id } }); },
    onError: (e) => setError(contactSaveError(e)),
  });
  const canSave = form.phoneNumber.replace(/\D/g, "").length >= 6 && !save.isPending;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.side}><Text style={styles.cancel}>Cancel</Text></Pressable>
        <Text style={styles.title} accessibilityRole="header">New contact</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !canSave, busy: save.isPending }} disabled={!canSave} onPress={() => save.mutate()} style={styles.side}>
          {save.isPending ? <ActivityIndicator color={colors.brand} /> : <Text style={[styles.save, !canSave && { opacity: 0.4 }]}>Save</Text>}
        </Pressable>
      </View>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
          {([["firstName", "First name", "default"], ["lastName", "Last name", "default"], ["phoneNumber", "WhatsApp number (with country code)", "phone-pad"], ["email", "Email", "email-address"]] as const).map(([k, label, kb]) => (
            <View key={k} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput value={form[k]} onChangeText={set(k)} accessibilityLabel={label} keyboardType={kb} autoCapitalize={k === "email" ? "none" : "words"} placeholder={k === "phoneNumber" ? "+44 7700 900123" : undefined} style={styles.input} />
            </View>
          ))}
          <Text style={styles.hint}>Groups, tags and custom fields can be added on the contact after saving, or on the web dashboard.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
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
