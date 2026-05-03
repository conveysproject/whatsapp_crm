# WBMSG — Sprint Planning Batch 5 (Sprints 19–24) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the WBMSG platform with mobile app, self-serve onboarding, advanced search, performance/caching, trained ML models, and Stripe billing — taking WBMSG from closed beta to general availability.

**Architecture:** Sprints 19–24 add the Expo mobile app (Expo 51 + Expo Router v3), layer Redis caching and rate limiting on the existing Fastify API, replace the heuristic ML models with trained scikit-learn classifiers, and introduce Stripe subscriptions with usage-based enforcement. Each sprint is independently deployable.

**Tech Stack:** Expo 51 + Expo Router v3 + `@clerk/clerk-expo`; `ioredis` (Redis cache); `@fastify/rate-limit`; scikit-learn + pandas + joblib (Python ML); Stripe SDK (`stripe` Node + `@stripe/stripe-js`); k6 (load testing)

---

## File Map

### Sprint 19 — Mobile App Shell + Inbox

| File | Action | Responsibility |
|---|---|---|
| `apps/mobile/app/_layout.tsx` | Create | Expo Router root layout (ClerkProvider, Stack navigator) |
| `apps/mobile/app/(auth)/sign-in.tsx` | Create | Clerk sign-in screen |
| `apps/mobile/app/(tabs)/_layout.tsx` | Create | Bottom tab navigator: Inbox, Contacts, Settings |
| `apps/mobile/app/(tabs)/index.tsx` | Create | Inbox tab: conversation list |
| `apps/mobile/app/(tabs)/contacts.tsx` | Create | Contacts tab: contact list |
| `apps/mobile/app/conversation/[id].tsx` | Create | Conversation detail: message thread + send box |
| `apps/mobile/components/ConversationListItem.tsx` | Create | Row: contact name, last message preview, unread badge |
| `apps/mobile/components/MessageBubble.tsx` | Create | Inbound (left) / outbound (right) bubble |
| `apps/mobile/components/SendMessageForm.tsx` | Create | Text input + send button |
| `apps/mobile/hooks/useConversations.ts` | Create | React Query fetch for conversation list |
| `apps/mobile/hooks/useMessages.ts` | Create | React Query fetch for messages in a conversation |
| `apps/mobile/hooks/useSendMessage.ts` | Create | Mutation for `POST /v1/conversations/:id/messages` |

### Sprint 20 — Self-Serve Onboarding

| File | Action | Responsibility |
|---|---|---|
| `apps/web/app/(onboarding)/layout.tsx` | Create | Onboarding shell layout (no sidebar) |
| `apps/web/app/(onboarding)/connect-waba/page.tsx` | Create | WABA OAuth wizard step 1: launch Meta Business OAuth |
| `apps/web/app/(onboarding)/connect-waba/callback/page.tsx` | Create | OAuth callback: exchange code for WABA access token |
| `apps/web/app/(onboarding)/provision-number/page.tsx` | Create | Step 2: select phone number from WABA account |
| `apps/web/app/(onboarding)/invite-team/page.tsx` | Create | Step 3: invite team members (Clerk org invitations) |
| `apps/web/app/(onboarding)/checklist/page.tsx` | Create | Onboarding checklist summary |
| `apps/api/src/routes/onboarding.ts` | Create | `POST /v1/onboarding/waba-callback`, `GET /v1/onboarding/status` |
| `apps/api/src/routes/onboarding.test.ts` | Create | Tests for onboarding routes |

### Sprint 21 — Advanced Search

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/lib/search.ts` | Modify | Add `searchConversations(orgId, query)` alongside existing contact search |
| `apps/api/src/routes/search.ts` | Create | `GET /v1/search?q=&type=contacts\|conversations\|all` |
| `apps/api/src/routes/search.test.ts` | Create | Tests for unified search |
| `apps/web/components/layout/GlobalSearch.tsx` | Create | Command-palette style search (⌘K): results grouped by type |
| `apps/web/app/(dashboard)/contacts/page.tsx` | Modify | Add advanced filter panel (lifecycle stage, tag, date range, custom fields) |

### Sprint 22 — Performance & Scale

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/lib/cache.ts` | Create | `ioredis` client; `cacheGet`, `cacheSet`, `cacheDel` helpers with TTL |
| `apps/api/src/routes/contacts.ts` | Modify | Cache contact list response (5 min TTL, invalidate on write) |
| `apps/api/src/routes/analytics.ts` | Modify | Cache analytics query results (5 min TTL) |
| `apps/api/src/plugins/rate-limit.ts` | Create | `@fastify/rate-limit` plugin: 100 req/min per IP; 1000 req/min per org |
| `apps/api/src/routes/organizations.ts` | Modify | Add `aiApiKey` (encrypted) field; `PATCH /v1/organizations` to set per-org key |
| `apps/api/src/lib/claude.ts` | Modify | Read per-org `aiApiKey` from org record if set, fall back to `ANTHROPIC_API_KEY` |

### Sprint 23 — Trained ML Models

| File | Action | Responsibility |
|---|---|---|
| `services/ml/training/train_churn.py` | Create | Load historical data CSV, engineer features, fit `GradientBoostingClassifier`, save to `artifacts/churn_model.joblib` |
| `services/ml/training/train_ltv.py` | Create | Fit `GradientBoostingRegressor` for LTV, save to `artifacts/ltv_model.joblib` |
| `services/ml/models/predictions.py` | Modify | Load joblib artifacts at startup; use trained model if artifact exists, fall back to heuristic |
| `services/ml/tests/test_trust_score.py` | Create | pytest unit tests for trust score model |
| `services/ml/tests/test_predictions.py` | Create | pytest tests for churn + LTV predictions |
| `services/ml/tests/conftest.py` | Create | Shared fixtures: `ContactFeatures` sample data |

### Sprint 24 — GA Launch & Billing

| File | Action | Responsibility |
|---|---|---|
| `apps/api/src/lib/stripe.ts` | Create | Stripe Node SDK client; `createCheckoutSession`, `getSubscription`, `handleWebhook` |
| `apps/api/src/routes/billing.ts` | Create | `POST /v1/billing/checkout`, `GET /v1/billing/subscription`, `POST /v1/billing/webhook` |
| `apps/api/src/routes/billing.test.ts` | Create | Tests for billing routes (mock Stripe SDK) |
| `apps/api/src/middleware/usage-limit.ts` | Create | Fastify hook: check monthly message count against plan limit; return 402 if exceeded |
| `apps/web/app/(dashboard)/settings/billing/page.tsx` | Create | Billing settings: current plan, usage meter, upgrade button |
| `load-tests/smoke.js` | Create | k6 smoke test: 10 VUs × 30 s on `/health`, `/v1/contacts`, `/v1/conversations` |
| `load-tests/soak.js` | Create | k6 soak test: 50 VUs × 10 min — baseline for p95 latency SLO |

---

## Task 1: Mobile App Shell (Expo Router + Clerk auth)

**Files:**
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(auth)/sign-in.tsx`
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/contacts.tsx`

- [ ] **Step 1: Install Expo dependencies**

```bash
cd apps/mobile
npx expo install expo-router @clerk/clerk-expo expo-secure-store expo-linking expo-constants expo-status-bar
```

- [ ] **Step 2: Write the root layout with ClerkProvider**

`apps/mobile/app/_layout.tsx`:
```typescript
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { Slot, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";

const tokenCache = {
  async getToken(key: string) {
    return SecureStore.getItemAsync(key);
  },
  async saveToken(key: string, value: string) {
    return SecureStore.setItemAsync(key, value);
  },
};

function AuthGuard() {
  const { isLoaded, isSignedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!isLoaded) return;
    const inAuth = segments[0] === "(auth)";
    if (!isSignedIn && !inAuth) router.replace("/(auth)/sign-in");
    if (isSignedIn && inAuth) router.replace("/(tabs)");
  }, [isLoaded, isSignedIn, segments]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <ClerkProvider
      publishableKey={process.env["EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"]!}
      tokenCache={tokenCache}
    >
      <AuthGuard />
    </ClerkProvider>
  );
}
```

- [ ] **Step 3: Write sign-in screen**

`apps/mobile/app/(auth)/sign-in.tsx`:
```typescript
import { useSignIn } from "@clerk/clerk-expo";
import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from "react-native";

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignIn() {
    if (!isLoaded) return;
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
      }
    } catch (err: unknown) {
      Alert.alert("Sign in failed", err instanceof Error ? err.message : "Unknown error");
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>WBMSG</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Pressable style={styles.button} onPress={handleSignIn}>
        <Text style={styles.buttonText}>Sign In</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 32, textAlign: "center" },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: "#25D366", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
```

- [ ] **Step 4: Write tab navigator**

`apps/mobile/app/(tabs)/_layout.tsx`:
```typescript
import { Tabs } from "expo-router";
import { MessageSquare, Users, Settings } from "lucide-react-native";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#25D366" }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Inbox", tabBarIcon: ({ color }) => <MessageSquare size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="contacts"
        options={{ title: "Contacts", tabBarIcon: ({ color }) => <Users size={22} color={color} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: "Settings", tabBarIcon: ({ color }) => <Settings size={22} color={color} /> }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 5: Write contacts tab (stub)**

`apps/mobile/app/(tabs)/contacts.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";

export default function ContactsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Contacts coming in Sprint 19</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { color: "#64748b" },
});
```

- [ ] **Step 6: Run the app**

```bash
cd apps/mobile
npx expo start --go
```

Expected: sign-in screen appears; enter credentials → tabs visible

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/app/
git commit -m "feat(mobile): add Expo Router shell with Clerk auth and tab navigator"
```

---

## Task 2: Mobile Inbox (Conversation List + Message Thread)

**Files:**
- Create: `apps/mobile/hooks/useConversations.ts`
- Create: `apps/mobile/hooks/useMessages.ts`
- Create: `apps/mobile/hooks/useSendMessage.ts`
- Create: `apps/mobile/components/ConversationListItem.tsx`
- Create: `apps/mobile/components/MessageBubble.tsx`
- Create: `apps/mobile/components/SendMessageForm.tsx`
- Create: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/app/conversation/[id].tsx`

- [ ] **Step 1: Install React Query in mobile app**

```bash
cd apps/mobile
pnpm add @tanstack/react-query
```

- [ ] **Step 2: Write conversation list hook**

`apps/mobile/hooks/useConversations.ts`:
```typescript
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

const API_URL = process.env["EXPO_PUBLIC_API_URL"]!;

export interface MobileConversation {
  id: string;
  contactName: string;
  lastMessageBody: string;
  lastMessageAt: string;
  status: "open" | "resolved";
  unreadCount: number;
}

export function useConversations() {
  const { getToken } = useAuth();
  return useQuery<MobileConversation[]>({
    queryKey: ["conversations"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations?status=open&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data = await res.json() as { conversations: MobileConversation[] };
      return data.conversations;
    },
    staleTime: 30_000,
  });
}
```

- [ ] **Step 3: Write messages hook**

`apps/mobile/hooks/useMessages.ts`:
```typescript
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

const API_URL = process.env["EXPO_PUBLIC_API_URL"]!;

export interface MobileMessage {
  id: string;
  body: string;
  direction: "inbound" | "outbound";
  type: "text" | "audio" | "image";
  transcription: string | null;
  createdAt: string;
}

export function useMessages(conversationId: string) {
  const { getToken } = useAuth();
  return useQuery<MobileMessage[]>({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json() as { messages: MobileMessage[] };
      return data.messages;
    },
    staleTime: 10_000,
  });
}
```

- [ ] **Step 4: Write send message mutation**

`apps/mobile/hooks/useSendMessage.ts`:
```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

const API_URL = process.env["EXPO_PUBLIC_API_URL"]!;

export function useSendMessage(conversationId: string) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const token = await getToken();
      const res = await fetch(`${API_URL}/v1/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("Failed to send message");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
```

- [ ] **Step 5: Write ConversationListItem component**

`apps/mobile/components/ConversationListItem.tsx`:
```typescript
import { Pressable, Text, View, StyleSheet } from "react-native";
import type { MobileConversation } from "../hooks/useConversations";

interface Props {
  conversation: MobileConversation;
  onPress: () => void;
}

export function ConversationListItem({ conversation, onPress }: Props) {
  const time = new Date(conversation.lastMessageAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{conversation.contactName.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.content}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{conversation.contactName}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.preview} numberOfLines={1}>{conversation.lastMessageBody}</Text>
          {conversation.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{conversation.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", padding: 16, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  content: { flex: 1 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "600", fontSize: 15, color: "#0f172a", flex: 1 },
  time: { fontSize: 12, color: "#94a3b8", marginLeft: 8 },
  preview: { fontSize: 14, color: "#64748b", flex: 1 },
  badge: { backgroundColor: "#25D366", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { color: "#fff", fontSize: 11, fontWeight: "600" },
});
```

- [ ] **Step 6: Write MessageBubble component**

`apps/mobile/components/MessageBubble.tsx`:
```typescript
import { View, Text, StyleSheet } from "react-native";
import type { MobileMessage } from "../hooks/useMessages";

interface Props { message: MobileMessage }

export function MessageBubble({ message }: Props) {
  const isOutbound = message.direction === "outbound";
  return (
    <View style={[styles.wrapper, isOutbound ? styles.outboundWrapper : styles.inboundWrapper]}>
      <View style={[styles.bubble, isOutbound ? styles.outboundBubble : styles.inboundBubble]}>
        {message.type === "audio" ? (
          <>
            <Text style={[styles.text, isOutbound && styles.outboundText]}>🎵 Voice message</Text>
            {message.transcription && (
              <Text style={[styles.transcript, isOutbound && styles.outboundText]}>
                "{message.transcription}"
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.text, isOutbound && styles.outboundText]}>{message.body}</Text>
        )}
        <Text style={[styles.time, isOutbound && styles.outboundTime]}>
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
  transcript: { fontSize: 13, color: "#475569", fontStyle: "italic", marginTop: 4 },
  time: { fontSize: 11, color: "#94a3b8", marginTop: 4, textAlign: "right" },
  outboundTime: { color: "rgba(255,255,255,0.7)" },
});
```

- [ ] **Step 7: Write SendMessageForm component**

`apps/mobile/components/SendMessageForm.tsx`:
```typescript
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
```

- [ ] **Step 8: Write Inbox tab (conversation list)**

`apps/mobile/app/(tabs)/index.tsx`:
```typescript
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
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
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
```

- [ ] **Step 9: Write conversation detail screen**

`apps/mobile/app/conversation/[id].tsx`:
```typescript
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
        inverted={false}
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
```

- [ ] **Step 10: Add `EXPO_PUBLIC_` env vars to `apps/mobile/.env`**

```
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
EXPO_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 11: Manual test**

Run `npx expo start --go` → sign in → inbox shows conversation list → tap conversation → messages appear → type and send a message → message appears in thread

- [ ] **Step 12: Commit**

```bash
git add apps/mobile/
git commit -m "feat(mobile): add inbox conversation list and message thread"
```

---

## Task 3: Mobile Push Notifications

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/lib/notifications.ts`
- Modify: `apps/api/src/workers/inbound-message.worker.ts`
- Modify: `apps/api/prisma/schema.prisma` (add `pushToken` to `UserProfile`)

- [ ] **Step 1: Install Expo Notifications**

```bash
cd apps/mobile
npx expo install expo-notifications expo-device
```

- [ ] **Step 2: Write notification registration helper**

`apps/mobile/lib/notifications.ts`:
```typescript
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const token = await Notifications.getExpoPushTokenAsync();
  return token.data;
}

export async function savePushToken(token: string, apiUrl: string, authToken: string) {
  await fetch(`${apiUrl}/v1/users/push-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ pushToken: token }),
  });
}
```

- [ ] **Step 3: Register token on sign-in (update root layout)**

Add to `apps/mobile/app/_layout.tsx` inside `AuthGuard` effect:

```typescript
import { registerForPushNotifications, savePushToken } from "../lib/notifications";

// Inside AuthGuard useEffect, after routing to tabs:
if (isSignedIn && !inAuth) {
  const apiToken = await getToken();
  const pushToken = await registerForPushNotifications();
  if (pushToken && apiToken) {
    const apiUrl = process.env["EXPO_PUBLIC_API_URL"]!;
    await savePushToken(pushToken, apiUrl, apiToken);
  }
}
```

- [ ] **Step 4: Add `pushToken` to Prisma `UserProfile` model**

`apps/api/prisma/schema.prisma` — add field to `UserProfile`:
```prisma
model UserProfile {
  id             String   @id @default(cuid())
  clerkUserId    String   @unique
  organizationId String
  role           String   @default("agent")
  isActive       Boolean  @default(true)
  pushToken      String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}
```

- [ ] **Step 5: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_user_push_token
pnpm exec prisma generate
```

- [ ] **Step 6: Add `POST /v1/users/push-token` route**

Add to `apps/api/src/routes/users.ts` (or create if it doesn't exist):
```typescript
fastify.post("/users/push-token", async (request, reply) => {
  const { pushToken } = request.body as { pushToken: string };
  const clerkUserId = request.auth.userId;
  await fastify.prisma.userProfile.update({
    where: { clerkUserId },
    data: { pushToken },
  });
  return reply.status(204).send();
});
```

- [ ] **Step 7: Send push notification in inbound message worker**

In `apps/api/src/workers/inbound-message.worker.ts`, after creating the conversation and assigning it:

```typescript
import { Expo } from "expo-server-sdk";

const expo = new Expo();

async function sendPushNotification(pushToken: string, contactName: string, body: string) {
  if (!Expo.isExpoPushToken(pushToken)) return;
  await expo.sendPushNotificationsAsync([{
    to: pushToken,
    title: contactName,
    body: body.slice(0, 100),
    sound: "default",
  }]);
}

// After assigning conversation to agent (assignedTo is set):
if (conversation.assignedTo) {
  const profile = await prisma.userProfile.findUnique({
    where: { clerkUserId: conversation.assignedTo },
    select: { pushToken: true },
  });
  if (profile?.pushToken) {
    await sendPushNotification(profile.pushToken, contactName, messageBody);
  }
}
```

- [ ] **Step 8: Install Expo Server SDK in API**

```bash
pnpm --filter @WBMSG/api add expo-server-sdk
```

- [ ] **Step 9: Manual test**

Send an inbound WhatsApp → push notification appears on device with contact name and message preview

- [ ] **Step 10: Commit**

```bash
git add apps/mobile/lib/ apps/mobile/app/_layout.tsx apps/api/prisma/ apps/api/src/
git commit -m "feat(mobile): add push notifications for new inbound messages"
```

---

## Task 4: Self-Serve WABA Onboarding Wizard

**Files:**
- Create: `apps/web/app/(onboarding)/layout.tsx`
- Create: `apps/web/app/(onboarding)/connect-waba/page.tsx`
- Create: `apps/web/app/(onboarding)/connect-waba/callback/page.tsx`
- Create: `apps/web/app/(onboarding)/provision-number/page.tsx`
- Create: `apps/web/app/(onboarding)/invite-team/page.tsx`
- Create: `apps/web/app/(onboarding)/checklist/page.tsx`
- Create: `apps/api/src/routes/onboarding.ts`
- Create: `apps/api/src/routes/onboarding.test.ts`

- [ ] **Step 1: Write failing tests for onboarding API**

`apps/api/src/routes/onboarding.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import { onboardingRoutes } from "./onboarding.js";

describe("POST /v1/onboarding/waba-callback", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_test", orgId: "org_test" };
    });
    const { PrismaClient } = await import("@prisma/client");
    app.decorate("prisma", new PrismaClient());
    await app.register(onboardingRoutes, { prefix: "/v1/onboarding" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it("returns 400 when code is missing", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/onboarding/waba-callback", body: {} });
    expect(res.statusCode).toBe(400);
  });

  it("GET /v1/onboarding/status returns onboarding state", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/onboarding/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { wabaConnected: boolean };
    expect(typeof body.wabaConnected).toBe("boolean");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test onboarding
```

Expected: FAIL — "Cannot find module './onboarding.js'"

- [ ] **Step 3: Implement onboarding routes**

`apps/api/src/routes/onboarding.ts`:
```typescript
import type { FastifyInstance } from "fastify";

export async function onboardingRoutes(fastify: FastifyInstance) {
  // Exchange Meta OAuth code for WABA access token + phone number ID
  fastify.post("/waba-callback", async (request, reply) => {
    const { code } = request.body as { code?: string };
    if (!code) return reply.status(400).send({ error: "code required" });

    const orgId = request.auth.orgId;

    // Exchange code for access token with Meta Graph API
    const tokenRes = await fetch(
      `https://graph.facebook.com/v20.0/oauth/access_token?client_id=${process.env["META_APP_ID"]}&client_secret=${process.env["META_APP_SECRET"]}&redirect_uri=${encodeURIComponent(process.env["META_REDIRECT_URI"]!)}&code=${code}`
    );
    if (!tokenRes.ok) return reply.status(502).send({ error: "meta_oauth_failed" });
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Persist access token on the organization record
    await fastify.prisma.organization.update({
      where: { id: orgId },
      data: { wabaAccessToken: access_token, onboardingStep: "provision_number" },
    });

    return reply.send({ success: true });
  });

  // Return onboarding completion state
  fastify.get("/status", async (request, reply) => {
    const orgId = request.auth.orgId;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: orgId },
      select: { wabaAccessToken: true, phoneNumberId: true, onboardingStep: true },
    });
    return reply.send({
      wabaConnected: !!org?.wabaAccessToken,
      numberProvisioned: !!org?.phoneNumberId,
      onboardingStep: org?.onboardingStep ?? "connect_waba",
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test onboarding
```

Expected: PASS

- [ ] **Step 5: Write onboarding layout**

`apps/web/app/(onboarding)/layout.tsx`:
```typescript
export default function OnboardingLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 w-full max-w-lg p-8">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Write WABA connect page (step 1)**

`apps/web/app/(onboarding)/connect-waba/page.tsx`:
```typescript
"use client";
import { useState } from "react";

export default function ConnectWABAPage(): JSX.Element {
  const [loading, setLoading] = useState(false);

  function handleConnect() {
    setLoading(true);
    const params = new URLSearchParams({
      client_id: process.env["NEXT_PUBLIC_META_APP_ID"]!,
      redirect_uri: `${window.location.origin}/onboarding/connect-waba/callback`,
      scope: "whatsapp_business_management,whatsapp_business_messaging",
      response_type: "code",
    });
    window.location.href = `https://www.facebook.com/v20.0/dialog/oauth?${params}`;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Connect WhatsApp Business</h1>
      <p className="text-gray-600 mb-8">
        Connect your WhatsApp Business Account so WBMSG can send and receive messages on your behalf.
      </p>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="w-full bg-[#25D366] text-white font-semibold py-3 rounded-lg hover:bg-[#1da851] disabled:opacity-50"
      >
        {loading ? "Redirecting…" : "Connect with Meta"}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Write OAuth callback page (step 1 completion)**

`apps/web/app/(onboarding)/connect-waba/callback/page.tsx`:
```typescript
"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function WABACallbackPage(): JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) { setError("OAuth failed — no code returned from Meta."); return; }
    fetch("/api/onboarding/waba-callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    })
      .then((r) => r.json())
      .then((data: { success?: boolean }) => {
        if (data.success) router.push("/onboarding/provision-number");
        else setError("Failed to connect WhatsApp account. Please try again.");
      })
      .catch(() => setError("Network error. Please try again."));
  }, [searchParams, router]);

  if (error) return <div className="text-red-600">{error}</div>;
  return <div className="text-gray-600">Connecting your WhatsApp Business account…</div>;
}
```

- [ ] **Step 8: Write provision number page (step 2)**

`apps/web/app/(onboarding)/provision-number/page.tsx`:
```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ProvisionNumberPage(): JSX.Element {
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function handleSave() {
    setSaving(true);
    await fetch("/api/organizations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumberId }),
    });
    router.push("/onboarding/invite-team");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Set Your Phone Number ID</h1>
      <p className="text-gray-600 mb-6">
        Find this in your Meta Business Manager under WhatsApp → Phone Numbers.
      </p>
      <input
        type="text"
        className="w-full border border-gray-300 rounded-lg px-4 py-2 mb-4"
        placeholder="Phone Number ID (e.g. 123456789012345)"
        value={phoneNumberId}
        onChange={(e) => setPhoneNumberId(e.target.value)}
      />
      <button
        onClick={handleSave}
        disabled={!phoneNumberId || saving}
        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Continue"}
      </button>
    </div>
  );
}
```

- [ ] **Step 9: Write invite team page (step 3)**

`apps/web/app/(onboarding)/invite-team/page.tsx`:
```typescript
"use client";
import { useOrganization } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteTeamPage(): JSX.Element {
  const { organization } = useOrganization();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string[]>([]);
  const router = useRouter();

  async function handleInvite() {
    if (!organization || !email) return;
    await organization.inviteMember({ emailAddress: email, role: "org:member" });
    setSent((prev) => [...prev, email]);
    setEmail("");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Invite Your Team</h1>
      <p className="text-gray-600 mb-6">Add agents who will handle WhatsApp conversations.</p>
      <div className="flex gap-2 mb-4">
        <input
          type="email"
          className="flex-1 border border-gray-300 rounded-lg px-4 py-2"
          placeholder="colleague@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button onClick={handleInvite} className="bg-blue-600 text-white px-4 rounded-lg hover:bg-blue-700">
          Invite
        </button>
      </div>
      {sent.map((e) => <p key={e} className="text-sm text-green-600">✓ Invited {e}</p>)}
      <button onClick={() => router.push("/onboarding/checklist")} className="mt-6 text-gray-500 underline text-sm">
        Skip for now
      </button>
    </div>
  );
}
```

- [ ] **Step 10: Write onboarding checklist page**

`apps/web/app/(onboarding)/checklist/page.tsx`:
```typescript
import Link from "next/link";

export default function OnboardingChecklistPage(): JSX.Element {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">You're all set! 🎉</h1>
      <p className="text-gray-600 mb-6">Your WBMSG workspace is ready.</p>
      <ul className="space-y-3 mb-8">
        {[
          "WhatsApp Business Account connected",
          "Phone number provisioned",
          "Team invites sent",
        ].map((item) => (
          <li key={item} className="flex items-center gap-2 text-gray-700">
            <span className="text-green-500">✓</span> {item}
          </li>
        ))}
      </ul>
      <Link href="/inbox" className="block w-full bg-[#25D366] text-white text-center font-semibold py-3 rounded-lg hover:bg-[#1da851]">
        Go to Inbox
      </Link>
    </div>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add apps/web/app/\(onboarding\)/ apps/api/src/routes/onboarding.ts apps/api/src/routes/onboarding.test.ts
git commit -m "feat: add self-serve WABA onboarding wizard"
```

---

## Task 5: Advanced Search (Meilisearch Unified)

**Files:**
- Modify: `apps/api/src/lib/search.ts`
- Create: `apps/api/src/routes/search.ts`
- Create: `apps/api/src/routes/search.test.ts`
- Create: `apps/web/components/layout/GlobalSearch.tsx`
- Modify: `apps/web/components/layout/TopBar.tsx`

- [ ] **Step 1: Write failing tests for unified search**

`apps/api/src/routes/search.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { searchRoutes } from "./search.js";

vi.mock("../lib/search.js", () => ({
  searchContacts: vi.fn().mockResolvedValue([{ id: "c1", name: "Alice", phone: "+1234567890" }]),
  searchConversations: vi.fn().mockResolvedValue([{ id: "cv1", contactName: "Alice", lastMessage: "Hello" }]),
}));

describe("GET /v1/search", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_test", orgId: "org_test" };
    });
    await app.register(searchRoutes, { prefix: "/v1" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it("returns contact and conversation results", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search?q=alice" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { contacts: unknown[]; conversations: unknown[] };
    expect(body.contacts).toHaveLength(1);
    expect(body.conversations).toHaveLength(1);
  });

  it("returns 400 when q is missing", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/search" });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test search
```

Expected: FAIL

- [ ] **Step 3: Add `searchConversations` to search lib**

`apps/api/src/lib/search.ts` — add alongside existing `searchContacts`:
```typescript
export interface ConversationSearchResult {
  id: string;
  contactName: string;
  lastMessage: string;
}

export async function searchConversations(
  organizationId: string,
  query: string,
  limit = 10
): Promise<ConversationSearchResult[]> {
  const index = meiliClient.index("conversations");
  const results = await index.search<ConversationSearchResult>(query, {
    filter: `organizationId = "${organizationId}"`,
    limit,
    attributesToRetrieve: ["id", "contactName", "lastMessage"],
  });
  return results.hits;
}
```

Also add conversation indexing in the inbound message worker:
```typescript
// After persisting conversation:
const convIndex = meiliClient.index("conversations");
await convIndex.addDocuments([{
  id: conversation.id,
  organizationId: conversation.organizationId,
  contactName,
  lastMessage: messageBody,
}]);
```

- [ ] **Step 4: Implement unified search route**

`apps/api/src/routes/search.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { searchContacts, searchConversations } from "../lib/search.js";

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get("/search", async (request, reply) => {
    const { q } = request.query as { q?: string };
    if (!q || q.trim().length === 0) return reply.status(400).send({ error: "q required" });

    const orgId = request.auth.orgId;
    const [contacts, conversations] = await Promise.all([
      searchContacts(orgId, q.trim(), 5),
      searchConversations(orgId, q.trim(), 5),
    ]);

    return reply.send({ contacts, conversations, query: q });
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test search
```

Expected: PASS

- [ ] **Step 6: Write GlobalSearch component**

`apps/web/components/layout/GlobalSearch.tsx`:
```typescript
"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

interface SearchResult {
  contacts: Array<{ id: string; name: string; phone: string }>;
  conversations: Array<{ id: string; contactName: string; lastMessage: string }>;
}

export function GlobalSearch(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(true); }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults(null); return; }
    const timeout = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json() as SearchResult;
      setResults(data);
      setLoading(false);
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-gray-500 bg-gray-100 rounded-lg px-3 py-2 text-sm hover:bg-gray-200">
        <Search size={14} /> Search <kbd className="text-xs text-gray-400 ml-2">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-4 border-b">
          <Search size={16} className="text-gray-400" />
          <input ref={inputRef} className="flex-1 outline-none text-sm" placeholder="Search contacts and conversations…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button onClick={() => setOpen(false)}><X size={16} className="text-gray-400" /></button>
        </div>
        {loading && <div className="p-4 text-sm text-gray-500">Searching…</div>}
        {results && !loading && (
          <div className="max-h-80 overflow-y-auto divide-y">
            {results.contacts.map((c) => (
              <button key={c.id} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm" onClick={() => { router.push(`/contacts/${c.id}`); setOpen(false); }}>
                <p className="font-medium text-gray-900">{c.name}</p>
                <p className="text-gray-500 text-xs">{c.phone}</p>
              </button>
            ))}
            {results.conversations.map((cv) => (
              <button key={cv.id} className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm" onClick={() => { router.push(`/inbox/${cv.id}`); setOpen(false); }}>
                <p className="font-medium text-gray-900">{cv.contactName}</p>
                <p className="text-gray-500 text-xs truncate">{cv.lastMessage}</p>
              </button>
            ))}
            {results.contacts.length === 0 && results.conversations.length === 0 && (
              <div className="p-4 text-sm text-gray-500">No results for "{query}"</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Add GlobalSearch to TopBar**

In `apps/web/components/layout/TopBar.tsx`, import and render `<GlobalSearch />` in the center of the top bar.

- [ ] **Step 8: Manual test**

Press ⌘K → search palette opens → type "Alice" → contacts and conversations appear → click a result → navigates to the correct page

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/search.ts apps/api/src/routes/search.test.ts apps/api/src/lib/search.ts apps/web/components/layout/GlobalSearch.tsx apps/web/components/layout/TopBar.tsx
git commit -m "feat: add unified search across contacts and conversations (⌘K)"
```

---

## Task 6: Redis Caching Layer

**Files:**
- Create: `apps/api/src/lib/cache.ts`
- Modify: `apps/api/src/routes/contacts.ts`
- Modify: `apps/api/src/routes/analytics.ts`

- [ ] **Step 1: Install ioredis**

```bash
pnpm --filter @WBMSG/api add ioredis
```

- [ ] **Step 2: Write cache helpers**

`apps/api/src/lib/cache.ts`:
```typescript
import Redis from "ioredis";

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redis.on("error", (err) => console.error("[cache] Redis error:", err));
  }
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const raw = await getRedis().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  try {
    await getRedis().setex(key, ttlSeconds, JSON.stringify(value));
  } catch {
    // Cache failure is non-fatal
  }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const keys = await getRedis().keys(pattern);
    if (keys.length > 0) await getRedis().del(...keys);
  } catch {
    // Non-fatal
  }
}
```

- [ ] **Step 3: Cache contact list in contacts route**

In `apps/api/src/routes/contacts.ts`, wrap `GET /v1/contacts`:
```typescript
import { cacheGet, cacheSet, cacheDel } from "../lib/cache.js";

// In GET handler:
const cacheKey = `contacts:${orgId}:list`;
const cached = await cacheGet(cacheKey);
if (cached) return reply.send(cached);

// ... existing query ...
const result = { contacts, nextCursor, total };
await cacheSet(cacheKey, result, 300);
return reply.send(result);

// In POST/PATCH/DELETE handlers (after mutation):
await cacheDel(`contacts:${orgId}:*`);
```

- [ ] **Step 4: Cache analytics results**

In `apps/api/src/routes/analytics.ts`, wrap each GET handler:
```typescript
import { cacheGet, cacheSet } from "../lib/cache.js";

// In GET /v1/analytics/overview:
const cacheKey = `analytics:${orgId}:overview`;
const cached = await cacheGet(cacheKey);
if (cached) return reply.send(cached);
// ... query ...
await cacheSet(cacheKey, result, 300);
return reply.send(result);
```

- [ ] **Step 5: Manual test**

```bash
# First request (cache miss)
time curl -H "Authorization: Bearer <token>" http://localhost:4000/v1/contacts
# Second request (cache hit — should be ~10x faster)
time curl -H "Authorization: Bearer <token>" http://localhost:4000/v1/contacts
```

Expected: second request is significantly faster

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/cache.ts apps/api/src/routes/contacts.ts apps/api/src/routes/analytics.ts
git commit -m "perf(api): add Redis cache-aside layer for contacts and analytics"
```

---

## Task 7: API Rate Limiting + Per-Org AI Keys

**Files:**
- Create: `apps/api/src/plugins/rate-limit.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/organizations.ts`
- Modify: `apps/api/src/lib/claude.ts`

- [ ] **Step 1: Install @fastify/rate-limit**

```bash
pnpm --filter @WBMSG/api add @fastify/rate-limit
```

- [ ] **Step 2: Write rate limit plugin**

`apps/api/src/plugins/rate-limit.ts`:
```typescript
import fastifyRateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import Redis from "ioredis";

export async function rateLimitPlugin(fastify: FastifyInstance) {
  await fastify.register(fastifyRateLimit, {
    redis: new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379"),
    max: 100,
    timeWindow: "1 minute",
    keyGenerator: (request) => {
      // Per-org limit (authenticated) or per-IP (unauthenticated)
      const orgId = (request as { auth?: { orgId?: string } }).auth?.orgId;
      return orgId ? `rate:org:${orgId}` : `rate:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: "Rate limit exceeded. Please retry after 1 minute.",
    }),
  });
}
```

- [ ] **Step 3: Register rate limit plugin in app.ts**

In `apps/api/src/app.ts`, register `rateLimitPlugin` before routes:
```typescript
import { rateLimitPlugin } from "./plugins/rate-limit.js";
await app.register(rateLimitPlugin);
```

- [ ] **Step 4: Add `aiApiKey` to Organization model**

`apps/api/prisma/schema.prisma` — add field to `Organization`:
```prisma
model Organization {
  id              String   @id @default(cuid())
  name            String
  clerkOrgId      String   @unique
  phoneNumberId   String?
  wabaAccessToken String?
  aiApiKey        String?
  onboardingStep  String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

- [ ] **Step 5: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_org_ai_api_key
pnpm exec prisma generate
```

- [ ] **Step 6: Add `PATCH /v1/organizations` to set AI key**

In `apps/api/src/routes/organizations.ts`:
```typescript
fastify.patch("/organizations", async (request, reply) => {
  const { aiApiKey, phoneNumberId } = request.body as { aiApiKey?: string; phoneNumberId?: string };
  const orgId = request.auth.orgId;
  // Only admins can update org settings (checked via Clerk role in auth middleware)
  const updated = await fastify.prisma.organization.update({
    where: { id: orgId },
    data: {
      ...(aiApiKey !== undefined && { aiApiKey }),
      ...(phoneNumberId !== undefined && { phoneNumberId }),
    },
    select: { id: true, name: true, phoneNumberId: true },
  });
  return reply.send(updated);
});
```

- [ ] **Step 7: Read per-org AI key in claude.ts**

`apps/api/src/lib/claude.ts` — update `generateSuggestions`:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";

async function getAnthropicClient(prisma: PrismaClient, orgId: string): Promise<Anthropic> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { aiApiKey: true },
  });
  const apiKey = org?.aiApiKey ?? process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  return new Anthropic({ apiKey });
}

export async function generateSuggestions(
  prisma: PrismaClient,
  orgId: string,
  history: Array<{ body: string; direction: string }>,
  count = 3
): Promise<string[]> {
  const client = await getAnthropicClient(prisma, orgId);
  // ... rest of implementation unchanged
}
```

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/plugins/rate-limit.ts apps/api/src/app.ts apps/api/src/routes/organizations.ts apps/api/src/lib/claude.ts apps/api/prisma/
git commit -m "feat(api): add rate limiting and per-org Anthropic API key support"
```

---

## Task 8: Trained ML Models (scikit-learn)

**Files:**
- Create: `services/ml/training/train_churn.py`
- Create: `services/ml/training/train_ltv.py`
- Modify: `services/ml/models/predictions.py`
- Create: `services/ml/tests/conftest.py`
- Create: `services/ml/tests/test_trust_score.py`
- Create: `services/ml/tests/test_predictions.py`

- [ ] **Step 1: Add training dependencies**

`services/ml/requirements.txt` (add to existing):
```
scikit-learn==1.4.2
pandas==2.2.2
joblib==1.4.2
pytest==8.2.0
```

- [ ] **Step 2: Write pytest fixtures**

`services/ml/tests/conftest.py`:
```python
import pytest
from app.models.trust_score import ContactFeatures

@pytest.fixture
def active_customer() -> ContactFeatures:
    return ContactFeatures(
        lifecycle_stage="customer",
        inbound_messages=40,
        total_messages=50,
        days_since_last_message=3,
        has_open_deal=True,
        deal_value=50000.0,
    )

@pytest.fixture
def churned_lead() -> ContactFeatures:
    return ContactFeatures(
        lifecycle_stage="prospect",
        inbound_messages=2,
        total_messages=10,
        days_since_last_message=120,
        has_open_deal=False,
        deal_value=0.0,
    )
```

- [ ] **Step 3: Write trust score tests**

`services/ml/tests/test_trust_score.py`:
```python
from app.models.trust_score import TrustScoreModel


def test_active_customer_high_score(active_customer):
    model = TrustScoreModel()
    result = model.compute(active_customer)
    assert result["score"] >= 70
    assert 0 <= result["score"] <= 100


def test_churned_lead_low_score(churned_lead):
    model = TrustScoreModel()
    result = model.compute(churned_lead)
    assert result["score"] < 40


def test_score_breakdown_has_four_components(active_customer):
    model = TrustScoreModel()
    result = model.compute(active_customer)
    assert set(result["breakdown"].keys()) == {"lifecycle", "engagement", "recency", "deal_activity"}


def test_score_is_integer(active_customer):
    model = TrustScoreModel()
    result = model.compute(active_customer)
    assert isinstance(result["score"], int)
```

- [ ] **Step 4: Write prediction tests**

`services/ml/tests/test_predictions.py`:
```python
from app.models.predictions import ChurnPredictor, LTVPredictor
from app.models.trust_score import ContactFeatures


def test_churn_high_for_inactive(churned_lead):
    predictor = ChurnPredictor()
    result = predictor.predict(churned_lead)
    assert result["label"] in ("high", "medium", "low")
    assert result["label"] == "high"


def test_churn_low_for_active_customer(active_customer):
    predictor = ChurnPredictor()
    result = predictor.predict(active_customer)
    assert result["label"] == "low"


def test_ltv_positive_for_deal(active_customer):
    predictor = LTVPredictor()
    result = predictor.predict(active_customer)
    assert result["estimated_ltv"] > 0
    assert 0.0 <= result["confidence"] <= 1.0
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd services/ml
pytest tests/ -v
```

Expected: FAIL — `ChurnPredictor`, `LTVPredictor` not yet updated

- [ ] **Step 6: Update predictions.py with trained model support**

`services/ml/models/predictions.py`:
```python
import os
from pathlib import Path
import joblib
from .trust_score import ContactFeatures

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"

class ChurnPredictor:
    def __init__(self):
        model_path = ARTIFACTS_DIR / "churn_model.joblib"
        self._model = joblib.load(model_path) if model_path.exists() else None

    def _to_features(self, f: ContactFeatures) -> list:
        stage_map = {"customer": 4, "opportunity": 3, "lead": 2, "prospect": 1, "churned": 0}
        return [
            stage_map.get(f.lifecycle_stage, 1),
            f.inbound_messages / max(f.total_messages, 1),
            f.days_since_last_message,
            1 if f.has_open_deal else 0,
            float(f.deal_value),
        ]

    def predict(self, features: ContactFeatures) -> dict:
        if self._model is not None:
            feature_vector = [self._to_features(features)]
            prob = float(self._model.predict_proba(feature_vector)[0][1])
            label = "high" if prob > 0.7 else "medium" if prob > 0.35 else "low"
            return {"probability": prob, "label": label}
        # Heuristic fallback
        is_inactive = features.days_since_last_message >= 90
        is_low_stage = features.lifecycle_stage in ("prospect", "churned")
        if is_inactive and is_low_stage:
            return {"probability": 0.85, "label": "high"}
        if is_inactive or is_low_stage:
            return {"probability": 0.45, "label": "medium"}
        return {"probability": 0.10, "label": "low"}


class LTVPredictor:
    def __init__(self):
        model_path = ARTIFACTS_DIR / "ltv_model.joblib"
        self._model = joblib.load(model_path) if model_path.exists() else None

    def predict(self, features: ContactFeatures) -> dict:
        if self._model is not None:
            feature_vector = [[
                float(features.deal_value),
                features.inbound_messages / max(features.total_messages, 1),
                features.days_since_last_message,
            ]]
            estimated_ltv = float(self._model.predict(feature_vector)[0])
            return {"estimated_ltv": max(0.0, estimated_ltv), "confidence": 0.75}
        # Heuristic: LTV ≈ current deal value × 1.5 if customer, else deal value
        multiplier = 1.5 if features.lifecycle_stage == "customer" else 1.0
        return {
            "estimated_ltv": float(features.deal_value) * multiplier,
            "confidence": 0.5,
        }
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd services/ml
pytest tests/ -v
```

Expected: all PASS

- [ ] **Step 8: Write churn training script**

`services/ml/training/train_churn.py`:
```python
"""
Train churn classifier from historical contact data CSV.

CSV columns: lifecycle_stage, engagement_ratio, days_since_last_message,
             has_open_deal, deal_value, churned (0 or 1)

Usage:
    python -m training.train_churn --data data/contacts_history.csv
"""
import argparse
from pathlib import Path
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

STAGE_MAP = {"customer": 4, "opportunity": 3, "lead": 2, "prospect": 1, "churned": 0}
ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    df["stage_num"] = df["lifecycle_stage"].map(STAGE_MAP).fillna(1)

    X = df[["stage_num", "engagement_ratio", "days_since_last_message", "has_open_deal", "deal_value"]]
    y = df["churned"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = GradientBoostingClassifier(n_estimators=100, max_depth=3, random_state=42)
    model.fit(X_train, y_train)

    print(classification_report(y_test, model.predict(X_test)))
    joblib.dump(model, ARTIFACTS_DIR / "churn_model.joblib")
    print(f"Model saved to {ARTIFACTS_DIR / 'churn_model.joblib'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 9: Write LTV training script**

`services/ml/training/train_ltv.py`:
```python
"""
Train LTV regressor from historical deal data CSV.

CSV columns: deal_value, engagement_ratio, days_since_last_message, actual_ltv

Usage:
    python -m training.train_ltv --data data/deals_history.csv
"""
import argparse
from pathlib import Path
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib

ARTIFACTS_DIR = Path(__file__).parent.parent / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", required=True)
    args = parser.parse_args()

    df = pd.read_csv(args.data)
    X = df[["deal_value", "engagement_ratio", "days_since_last_message"]]
    y = df["actual_ltv"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = GradientBoostingRegressor(n_estimators=100, max_depth=3, random_state=42)
    model.fit(X_train, y_train)

    mae = mean_absolute_error(y_test, model.predict(X_test))
    print(f"MAE: {mae:.2f}")
    joblib.dump(model, ARTIFACTS_DIR / "ltv_model.joblib")
    print(f"Model saved to {ARTIFACTS_DIR / 'ltv_model.joblib'}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 10: Commit**

```bash
git add services/ml/
git commit -m "feat(ml): add trained scikit-learn churn/LTV models with heuristic fallback"
```

---

## Task 9: Stripe Billing + Usage Limits

**Files:**
- Create: `apps/api/src/lib/stripe.ts`
- Create: `apps/api/src/routes/billing.ts`
- Create: `apps/api/src/routes/billing.test.ts`
- Create: `apps/api/src/middleware/usage-limit.ts`
- Create: `apps/web/app/(dashboard)/settings/billing/page.tsx`

- [ ] **Step 1: Install Stripe SDK**

```bash
pnpm --filter @WBMSG/api add stripe
pnpm --filter @WBMSG/web add @stripe/stripe-js
```

- [ ] **Step 2: Write failing tests for billing**

`apps/api/src/routes/billing.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify from "fastify";
import { billingRoutes } from "./billing.js";

vi.mock("../lib/stripe.js", () => ({
  createCheckoutSession: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/session_test" }),
  getSubscription: vi.fn().mockResolvedValue({ plan: "starter", status: "active", currentPeriodEnd: "2026-05-28T00:00:00Z" }),
}));

describe("Billing routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    app.addHook("preHandler", async (req) => {
      req.auth = { userId: "user_test", orgId: "org_test" };
    });
    const { PrismaClient } = await import("@prisma/client");
    app.decorate("prisma", new PrismaClient());
    await app.register(billingRoutes, { prefix: "/v1/billing" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  it("POST /v1/billing/checkout returns redirect URL", async () => {
    const res = await app.inject({ method: "POST", url: "/v1/billing/checkout", body: { plan: "starter" } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string };
    expect(body.url).toContain("stripe.com");
  });

  it("GET /v1/billing/subscription returns subscription details", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/billing/subscription" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { plan: string; status: string };
    expect(body.plan).toBe("starter");
    expect(body.status).toBe("active");
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @WBMSG/api test billing
```

Expected: FAIL

- [ ] **Step 4: Implement Stripe client**

`apps/api/src/lib/stripe.ts`:
```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"]!, {
  apiVersion: "2024-04-10",
  typescript: true,
});

const PLAN_PRICE_IDS: Record<string, string> = {
  starter: process.env["STRIPE_STARTER_PRICE_ID"]!,
  growth: process.env["STRIPE_GROWTH_PRICE_ID"]!,
  enterprise: process.env["STRIPE_ENTERPRISE_PRICE_ID"]!,
};

export async function createCheckoutSession(
  orgId: string,
  plan: string,
  successUrl: string,
  cancelUrl: string
): Promise<{ url: string }> {
  const priceId = PLAN_PRICE_IDS[plan];
  if (!priceId) throw new Error(`Unknown plan: ${plan}`);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { orgId },
  });

  return { url: session.url! };
}

export async function getSubscription(stripeCustomerId: string): Promise<{
  plan: string;
  status: string;
  currentPeriodEnd: string;
} | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "active",
    limit: 1,
  });

  const sub = subscriptions.data[0];
  if (!sub) return null;

  const priceId = sub.items.data[0]?.price.id;
  const plan = Object.entries(PLAN_PRICE_IDS).find(([, id]) => id === priceId)?.[0] ?? "unknown";

  return {
    plan,
    status: sub.status,
    currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString(),
  };
}

export async function handleWebhook(
  payload: Buffer,
  signature: string
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env["STRIPE_WEBHOOK_SECRET"]!
  );
}
```

- [ ] **Step 5: Implement billing routes**

`apps/api/src/routes/billing.ts`:
```typescript
import type { FastifyInstance } from "fastify";
import { createCheckoutSession, getSubscription, handleWebhook } from "../lib/stripe.js";

export async function billingRoutes(fastify: FastifyInstance) {
  fastify.post("/checkout", async (request, reply) => {
    const { plan } = request.body as { plan: string };
    const orgId = request.auth.orgId;
    const baseUrl = process.env["WEB_BASE_URL"]!;
    const result = await createCheckoutSession(
      orgId, plan,
      `${baseUrl}/settings/billing?success=true`,
      `${baseUrl}/settings/billing?canceled=true`
    );
    return reply.send(result);
  });

  fastify.get("/subscription", async (request, reply) => {
    const orgId = request.auth.orgId;
    const org = await fastify.prisma.organization.findUnique({
      where: { id: orgId },
      select: { stripeCustomerId: true },
    });
    if (!org?.stripeCustomerId) return reply.send({ plan: "free", status: "none" });
    const sub = await getSubscription(org.stripeCustomerId);
    return reply.send(sub ?? { plan: "free", status: "none" });
  });

  // Raw body needed for Stripe signature verification
  fastify.post("/webhook", {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers["stripe-signature"] as string;
    let event;
    try {
      event = await handleWebhook(request.rawBody as Buffer, sig);
    } catch {
      return reply.status(400).send({ error: "Invalid signature" });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { metadata: { orgId: string }; customer: string };
      await fastify.prisma.organization.update({
        where: { id: session.metadata.orgId },
        data: { stripeCustomerId: session.customer },
      });
    }

    return reply.send({ received: true });
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @WBMSG/api test billing
```

Expected: PASS

- [ ] **Step 7: Write usage limit middleware**

`apps/api/src/middleware/usage-limit.ts`:
```typescript
import type { FastifyRequest, FastifyReply } from "fastify";

const PLAN_MESSAGE_LIMITS: Record<string, number> = {
  free: 500,
  starter: 5000,
  growth: 25000,
  enterprise: Infinity,
};

export async function checkUsageLimit(
  request: FastifyRequest & { prisma: unknown; auth: { orgId: string } },
  reply: FastifyReply
): Promise<void> {
  const orgId = request.auth.orgId;
  const prisma = (request.server as { prisma: { organization: { findUnique: (args: unknown) => Promise<{ plan?: string } | null> }; message: { count: (args: unknown) => Promise<number> } } }).prisma;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { plan: true },
  });

  const plan = org?.plan ?? "free";
  const limit = PLAN_MESSAGE_LIMITS[plan] ?? PLAN_MESSAGE_LIMITS["free"]!;

  if (limit === Infinity) return;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const count = await prisma.message.count({
    where: {
      organizationId: orgId,
      direction: "outbound",
      createdAt: { gte: startOfMonth },
    },
  });

  if (count >= limit) {
    return reply.status(402).send({
      error: "usage_limit_exceeded",
      message: `Your ${plan} plan allows ${limit} outbound messages per month. Upgrade to send more.`,
      limit,
      used: count,
    });
  }
}
```

- [ ] **Step 8: Wire usage limit to send message route**

In `apps/api/src/routes/conversations.ts`, add `preHandler` to the POST `/conversations/:id/messages` route:
```typescript
import { checkUsageLimit } from "../middleware/usage-limit.js";

fastify.post("/:id/messages", {
  preHandler: [checkUsageLimit],
}, async (request, reply) => {
  // ... existing send handler
});
```

- [ ] **Step 9: Add `plan` and `stripeCustomerId` to Organization schema**

`apps/api/prisma/schema.prisma`:
```prisma
model Organization {
  // ... existing fields
  plan             String   @default("free")
  stripeCustomerId String?
}
```

- [ ] **Step 10: Run migration**

```bash
cd apps/api
pnpm exec prisma migrate dev --name add_org_billing
pnpm exec prisma generate
```

- [ ] **Step 11: Write billing settings page**

`apps/web/app/(dashboard)/settings/billing/page.tsx`:
```typescript
"use client";
import { useState } from "react";

const PLANS = [
  { id: "starter", name: "Starter", price: "₹2,999/mo", messages: "5,000 messages/mo", agents: "Up to 5 agents" },
  { id: "growth", name: "Growth", price: "₹7,999/mo", messages: "25,000 messages/mo", agents: "Up to 20 agents" },
  { id: "enterprise", name: "Enterprise", price: "Custom", messages: "Unlimited messages", agents: "Unlimited agents" },
];

export default function BillingPage(): JSX.Element {
  const [upgrading, setUpgrading] = useState<string | null>(null);

  async function handleUpgrade(plan: string) {
    setUpgrading(plan);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json() as { url?: string };
    if (data.url) window.location.href = data.url;
    else setUpgrading(null);
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Billing</h1>
      <p className="text-gray-600 mb-8">Manage your subscription and usage.</p>
      <div className="grid gap-4">
        {PLANS.map((plan) => (
          <div key={plan.id} className="border border-gray-200 rounded-xl p-6 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">{plan.name}</h2>
              <p className="text-sm text-gray-500">{plan.messages} · {plan.agents}</p>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-bold text-gray-900">{plan.price}</span>
              {plan.id !== "enterprise" && (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={upgrading === plan.id}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {upgrading === plan.id ? "Redirecting…" : "Upgrade"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/lib/stripe.ts apps/api/src/routes/billing.ts apps/api/src/routes/billing.test.ts apps/api/src/middleware/usage-limit.ts apps/api/prisma/ apps/web/app/\(dashboard\)/settings/billing/
git commit -m "feat: add Stripe billing, plan enforcement, and usage limit middleware"
```

---

## Task 10: Load Tests + Final GA Polish

**Files:**
- Create: `load-tests/smoke.js`
- Create: `load-tests/soak.js`
- Modify: `apps/web/components/layout/Sidebar.tsx` (add billing link)
- Modify: `apps/web/app/(dashboard)/settings/routing/page.tsx` (wire up "Add Rule" modal placeholder → Sprint 13 deferred item)

- [ ] **Step 1: Write k6 smoke test**

`load-tests/smoke.js`:
```javascript
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "30s",
  thresholds: {
    http_req_duration: ["p(95)<500"],
    http_req_failed: ["rate<0.01"],
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:4000";
const TOKEN = __ENV.API_TOKEN || "";

export default function () {
  const headers = { Authorization: `Bearer ${TOKEN}` };

  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { "health 200": (r) => r.status === 200 });

  const contactsRes = http.get(`${BASE_URL}/v1/contacts?limit=20`, { headers });
  check(contactsRes, { "contacts 200": (r) => r.status === 200 });

  const convRes = http.get(`${BASE_URL}/v1/conversations?status=open&limit=20`, { headers });
  check(convRes, { "conversations 200": (r) => r.status === 200 });

  sleep(1);
}
```

- [ ] **Step 2: Write k6 soak test**

`load-tests/soak.js`:
```javascript
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "2m", target: 50 },  // ramp up
    { duration: "6m", target: 50 },  // sustain
    { duration: "2m", target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<800"],
    http_req_failed: ["rate<0.02"],
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:4000";
const TOKEN = __ENV.API_TOKEN || "";

export default function () {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  http.get(`${BASE_URL}/v1/contacts?limit=50`, { headers });
  http.get(`${BASE_URL}/v1/conversations?status=open&limit=50`, { headers });
  http.get(`${BASE_URL}/v1/analytics/overview`, { headers });
  sleep(2);
}
```

- [ ] **Step 3: Run smoke test against local environment**

```bash
docker compose up -d
k6 run --env API_URL=http://localhost:4000 --env API_TOKEN=<test-token> load-tests/smoke.js
```

Expected output:
```
✓ health 200
✓ contacts 200
✓ conversations 200
http_req_duration p(95)<500 ✓
http_req_failed rate<0.01 ✓
```

- [ ] **Step 4: Add Billing link to Sidebar**

In `apps/web/components/layout/Sidebar.tsx`, add billing nav item:
```typescript
{ href: "/settings/billing", icon: CreditCard, label: "Billing" },
```

- [ ] **Step 5: Final type-check + lint pass**

```bash
pnpm type-check
pnpm lint
```

Fix any errors before committing.

- [ ] **Step 6: Commit**

```bash
git add load-tests/ apps/web/components/layout/Sidebar.tsx
git commit -m "feat: add k6 load tests and billing sidebar link for GA"
```

---

## Task 11: Final type-check, lint, and GA readiness verification

- [ ] **Step 1: Run full test suite**

```bash
pnpm --filter @WBMSG/api test
```

Expected: all tests pass across all test files

- [ ] **Step 2: Type-check all packages**

```bash
pnpm type-check
```

Expected: 0 errors

- [ ] **Step 3: Lint all packages**

```bash
pnpm lint
```

Expected: 0 errors

- [ ] **Step 4: Run Python ML tests**

```bash
cd services/ml
pytest tests/ -v
```

Expected: all tests pass

- [ ] **Step 5: GA Readiness Checklist**

- [ ] All 24 sprint Definition of Done items verified
- [ ] Stripe checkout flow tested end-to-end in Stripe test mode
- [ ] k6 soak test p(95) <800 ms at 50 VUs sustained for 6 minutes
- [ ] Sentry shows no unhandled errors in staging after 48-hour soak
- [ ] Datadog dashboard showing API latency, error rate, BullMQ queue depth
- [ ] Mobile app (iOS + Android) submitted to App Store / Play Store (internal test track)
- [ ] Self-serve signup flow tested: new user → WABA connect → phone number → invite team → inbox working
- [ ] Usage limits enforced: free plan user blocked at 500 messages/mo
- [ ] `GET /health` → 200 on production

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: sprint 24 GA readiness — all checks passed"
```
