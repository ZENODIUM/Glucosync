import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function AuthCallbackScreen() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color="#1b7a5c" />
      <Text style={styles.text}>Signing you in…</Text>
      <Redirect href="/" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#eef6f2",
  },
  text: { color: "#2f5c4a", fontSize: 15 },
});
