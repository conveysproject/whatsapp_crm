import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";
import { API_VERSION } from "@WBMSG/shared";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WBMSG</Text>
      <Text>API {API_VERSION} — mobile stub</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
});
