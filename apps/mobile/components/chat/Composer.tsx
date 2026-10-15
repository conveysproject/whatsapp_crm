// apps/mobile/components/chat/Composer.tsx
import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { FileText, Image as ImageIcon, MessageSquareText, Plus, Send, Sparkles, Zap } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useApi } from "../../lib/api-context";
import { canSendFreeForm, keys, sendErrorMessage, type ConversationItem } from "../../lib/conversations";
import { contentTypeForMime, uploadMedia } from "../../lib/media-upload";
import { colors, font, radius, space } from "../../lib/theme";

const drafts = new Map<string, string>();
export function setComposerDraft(conversationId: string, text: string): void { drafts.set(conversationId, text); }
export function takeComposerDraft(conversationId: string): string | null {
  const t = drafts.get(conversationId) ?? null;
  drafts.delete(conversationId);
  return t;
}

export function Composer({ conversation }: { conversation: ConversationItem }) {
  const api = useApi();
  const { getToken } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const id = conversation.id;
  const [text, setText] = useState("");
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const freeForm = canSendFreeForm(conversation);

  useFocusEffect(useCallback(() => {
    const d = takeComposerDraft(id);
    if (d !== null) setText(d);
  }, [id]));

  const suggestions = useQuery({
    queryKey: ["suggestions", id, conversation.lastMessage?.id ?? null],
    queryFn: async () => (await api<{ data: { suggestions: string[] } }>(`/conversations/${id}/suggestions`, { method: "POST" })).data.suggestions,
    enabled: freeForm && conversation.lastMessage?.direction === "inbound",
    staleTime: Infinity,
    retry: false,
  });

  const afterSend = () => {
    void qc.invalidateQueries({ queryKey: keys.messages(id) });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  const sendText = useMutation({
    mutationFn: (body: string) => api(`/conversations/${id}/messages`, { method: "POST", body: { contentType: "text", text: body } }),
    onMutate: () => setError(null),
    onSuccess: () => { setText(""); afterSend(); },
    onError: (e) => setError(sendErrorMessage(e)),
  });

  const sendFile = useMutation({
    mutationFn: async (f: { uri: string; name: string; mimeType: string }) => {
      const up = await uploadMedia({ ...f, getToken: () => getToken() });
      return api(`/conversations/${id}/messages`, {
        method: "POST",
        body: { contentType: contentTypeForMime(up.mimeType), mediaId: up.mediaId, mimeType: up.mimeType, filename: up.filename },
      });
    },
    onMutate: () => { setError(null); setMenu(false); },
    onSuccess: afterSend,
    onError: (e) => setError(sendErrorMessage(e)),
  });

  async function pickPhoto() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 0.8 });
    const a = r.canceled ? null : r.assets[0];
    if (a) sendFile.mutate({ uri: a.uri, name: a.fileName ?? "photo.jpg", mimeType: a.mimeType ?? "image/jpeg" });
  }
  async function pickDocument() {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    if (a) sendFile.mutate({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? "application/octet-stream" });
  }

  const busy = sendText.isPending || sendFile.isPending;

  if (!freeForm) {
    return (
      <View style={styles.bar}>
        {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
        <Pressable accessibilityRole="button" style={styles.templateBtn} onPress={() => router.push(`/conversation/${id}/template`)}>
          <FileText size={18} color="#FFFFFF" /><Text style={styles.templateText}>Send template</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.bar}>
      {suggestions.data && suggestions.data.length > 0 && !text ? (
        <View>
          <View style={styles.sugHead}><Sparkles size={14} color="#6D28D9" /><Text style={styles.sugTitle}>Smart replies</Text></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugRow}>
            {suggestions.data.map((s) => (
              <Pressable key={s} accessibilityRole="button" onPress={() => setText(s)} style={styles.sug}><Text style={styles.sugText} numberOfLines={1}>{s}</Text></Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="More: attach, canned responses, template" onPress={() => setMenu(true)} style={styles.icon} disabled={busy}>
          <Plus size={24} color={colors.text} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={(t) => { if (t === "/") { setText(""); router.push(`/conversation/${id}/template`); } else setText(t); }}
          placeholder="Message, or / for templates"
          accessibilityLabel="Message"
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !text.trim() || busy, busy }}
          disabled={!text.trim() || busy}
          onPress={() => sendText.mutate(text.trim())}
          style={[styles.send, (!text.trim() || busy) && styles.disabled]}
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Send size={20} color="#FFFFFF" />}
        </Pressable>
      </View>
      <Modal visible={menu} transparent animationType="slide" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)} accessibilityLabel="Close menu" />
        <View style={styles.sheet} accessibilityRole="menu">
          {[
            { label: "Attach photo or video", Icon: ImageIcon, onPress: () => void pickPhoto() },
            { label: "Attach document", Icon: FileText, onPress: () => void pickDocument() },
            { label: "Canned responses", Icon: Zap, onPress: () => { setMenu(false); router.push(`/conversation/${id}/canned`); } },
            { label: "Send template", Icon: MessageSquareText, onPress: () => { setMenu(false); router.push(`/conversation/${id}/template`); } },
          ].map(({ label, Icon, onPress }) => (
            <Pressable key={label} accessibilityRole="menuitem" onPress={onPress} style={styles.menuItem}>
              <Icon size={22} color={colors.brand} /><Text style={styles.menuText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: space.sm, paddingTop: space.sm, paddingBottom: space.md, gap: space.sm },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  icon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, backgroundColor: colors.background, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, fontFamily: font.regular, fontSize: 16, color: colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.5 },
  sugHead: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 },
  sugTitle: { fontFamily: font.semibold, fontSize: 12, color: "#6D28D9" },
  sugRow: { gap: space.sm, paddingHorizontal: 4, paddingTop: 6 },
  sug: { maxWidth: 260, minHeight: 36, justifyContent: "center", paddingHorizontal: space.md, borderRadius: 18, borderWidth: 1, borderColor: "#DDD6FE", backgroundColor: "#F5F3FF" },
  sugText: { fontFamily: font.medium, fontSize: 13, color: "#4C1D95" },
  error: { fontFamily: font.medium, fontSize: 13, color: colors.danger, paddingHorizontal: 4 },
  templateBtn: { flexDirection: "row", gap: space.sm, height: 48, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  templateText: { fontFamily: font.semibold, fontSize: 16, color: "#FFFFFF" },
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.35)" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: space.sm, paddingBottom: space.xxl },
  menuItem: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, paddingHorizontal: space.lg },
  menuText: { fontFamily: font.regular, fontSize: 16, color: colors.text },
});
