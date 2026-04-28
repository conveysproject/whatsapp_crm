import { useAuth } from "@clerk/clerk-expo";
import { View, Text, Pressable, StyleSheet } from "react-native";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  return (
    <View style={styles.container}>
      <Pressable style={styles.button} onPress={() => void signOut()}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  button: { backgroundColor: "#ef4444", padding: 14, borderRadius: 8, width: "100%", alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
});
