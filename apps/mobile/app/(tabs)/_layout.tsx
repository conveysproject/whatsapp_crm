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
