import { View, Text, StyleSheet } from "react-native";

export default function ContactsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Contacts</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  text: { color: "#64748b" },
});
