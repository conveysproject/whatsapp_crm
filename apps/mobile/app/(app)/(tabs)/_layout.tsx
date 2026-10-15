import { Tabs } from "expo-router";
import { ChartColumn, CircleUserRound, MessageSquare, Users } from "lucide-react-native";
import { colors, font } from "../../../lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11 },
        tabBarStyle: { borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: ({ color, size }) => <MessageSquare color={color} size={size} /> }} />
      <Tabs.Screen name="contacts" options={{ title: "Contacts", tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size} /> }} />
      <Tabs.Screen name="me" options={{ title: "Me", tabBarIcon: ({ color, size }) => <CircleUserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
