import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";

export default function SettingsScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useSession();
  const [saving, setSaving] = useState(false);

  async function toggleGlp1() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ glp1_mode: !profile.glp1_mode })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      Alert.alert("Could not update", error.message);
      return;
    }
    await refreshProfile();
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert("Sign out failed", error.message);
      return;
    }
    router.replace("/");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>
      <Text style={styles.lead}>Account and app preferences.</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.kv}>Email: {session?.user?.email ?? "(not provided)"}</Text>
        <Text style={styles.kv}>User ID: {session?.user?.id ?? "unknown"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preferences</Text>
        <Pressable style={styles.rowBtn} onPress={toggleGlp1} disabled={saving || !profile}>
          <Text style={styles.rowBtnText}>GLP-1 companion mode</Text>
          <Text style={styles.rowBtnValue}>
            {saving ? "..." : profile?.glp1_mode ? "On" : "Off"}
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.logout} onPress={signOut}>
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f2" },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  h1: { fontSize: 26, fontWeight: "700", color: "#0d3d2c" },
  lead: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d9e8df",
    gap: 10,
  },
  cardTitle: { fontSize: 17, fontWeight: "800", color: "#0d3d2c" },
  kv: { fontSize: 14, color: "#2f4a3f" },
  rowBtn: {
    backgroundColor: "#f7fbf9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d9e8df",
    padding: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowBtnText: { fontSize: 15, color: "#1f332b", fontWeight: "600" },
  rowBtnValue: { fontSize: 15, color: "#1b7a5c", fontWeight: "700" },
  logout: {
    marginTop: 6,
    backgroundColor: "#c9493f",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  logoutText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
