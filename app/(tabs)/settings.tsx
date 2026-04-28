import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../lib/session";
import { theme } from "../../lib/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const { session, profile, refreshProfile } = useSession();
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [checking, setChecking] = useState(false);
  const [resetting, setResetting] = useState(false);

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
    if (signingOut) return;
    setSigningOut(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    setSigningOut(false);
    if (error) {
      Alert.alert("Sign out failed", error.message);
      return;
    }
    router.replace("/login");
  }

  async function runConnectivityCheck() {
    if (checking) return;
    setChecking(true);
    try {
      const lines: string[] = [];

      const { data: sData, error: sErr } = await supabase.auth.getSession();
      if (sErr) lines.push(`Auth session: FAIL (${sErr.message})`);
      else lines.push(`Auth session: ${sData.session ? "OK" : "No active session"}`);

      const uid = sData.session?.user?.id;
      if (!uid) {
        lines.push("Profile read: SKIPPED (not signed in)");
      } else {
        const { error: pErr } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
        lines.push(`Profile read: ${pErr ? `FAIL (${pErr.message})` : "OK"}`);
      }

      const { error: gErr } = await supabase
        .from("glucose_readings")
        .select("id", { head: true, count: "exact" })
        .limit(1);
      lines.push(`DB read (glucose): ${gErr ? `FAIL (${gErr.message})` : "OK"}`);

      const { error: stErr } = await supabase.storage.from("meal-images").list("", { limit: 1 });
      lines.push(`Storage access: ${stErr ? `FAIL (${stErr.message})` : "OK"}`);

      const { error: fnErr } = await supabase.functions.invoke("voice-agent", {
        body: { transcript: "health check ping" },
      });
      lines.push(`Edge function (voice-agent): ${fnErr ? `FAIL (${fnErr.message})` : "OK"}`);

      Alert.alert("Connectivity check", lines.join("\n"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Connectivity check", `Unexpected error: ${msg}`);
    } finally {
      setChecking(false);
    }
  }

  function confirmReset() {
    Alert.alert(
      "Reset account data",
      "This will delete your glucose logs, meals, plans, insights, agent history, and uploaded meal media. You will start again from onboarding.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset everything",
          style: "destructive",
          onPress: () => {
            void resetAccountData();
          },
        },
      ],
    );
  }

  async function resetAccountData() {
    if (resetting) return;
    setResetting(true);
    try {
      const { error } = await supabase.functions.invoke("reset-account", { body: {} });
      if (error) throw error;
      const { error: signErr } = await supabase.auth.signOut({ scope: "local" });
      if (signErr) throw signErr;
      Alert.alert("Reset complete", "Your account data was reset. Sign in again to start onboarding.");
      router.replace("/login");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Reset failed", msg);
    } finally {
      setResetting(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.kv}>Email: {session?.user?.email ?? "(not provided)"}</Text>
        <Text style={styles.kvMono}>ID: {session?.user?.id ?? "unknown"}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Preferences</Text>
        <Text style={styles.kv}>
          Diet preferences: {(profile?.dietary_preferences ?? ["balanced"]).join(", ")}
        </Text>
        <Text style={styles.kv}>Onboarding: {profile?.onboarding_completed ? "Completed" : "Pending"}</Text>
        <Text style={styles.kv}>Health sync: {profile?.health_sync_enabled ? "Enabled" : "Off"}</Text>
        <Pressable style={styles.rowBtn} onPress={toggleGlp1} disabled={saving || !profile}>
          <Text style={styles.rowBtnText}>GLP-1 mode</Text>
          <Text style={styles.rowBtnValue}>{saving ? "..." : profile?.glp1_mode ? "ON" : "OFF"}</Text>
        </Pressable>
        <Pressable style={styles.rowBtn} onPress={runConnectivityCheck} disabled={checking}>
          <Text style={styles.rowBtnText}>Connectivity check</Text>
          <Text style={styles.rowBtnValue}>{checking ? "RUNNING" : "RUN"}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Danger zone</Text>
        <Pressable style={[styles.resetBtn, resetting && styles.logoutDisabled]} onPress={confirmReset} disabled={resetting}>
          <Text style={styles.resetText}>{resetting ? "Resetting..." : "Reset account data"}</Text>
        </Pressable>
      </View>

      <Pressable style={[styles.logout, signingOut && styles.logoutDisabled]} onPress={signOut} disabled={signingOut}>
        <Text style={styles.logoutText}>{signingOut ? "Logging out..." : "Log out"}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 18, paddingBottom: 120, gap: 12 },
  h1: { fontSize: 32, fontWeight: "900", letterSpacing: -1, color: theme.colors.text },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  cardTitle: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", color: theme.colors.textMuted },
  kv: { color: theme.colors.textMuted, fontSize: 14 },
  kvMono: { fontFamily: "monospace", color: theme.colors.text, fontSize: 12 },
  rowBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: theme.colors.surface,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowBtnText: { color: theme.colors.text, fontWeight: "700" },
  rowBtnValue: { color: theme.colors.accent, fontWeight: "800", fontFamily: "monospace" },
  logout: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  logoutDisabled: { opacity: 0.65 },
  logoutText: { color: theme.colors.text, fontWeight: "800" },
  resetBtn: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: "#b42318",
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  resetText: { color: "#b42318", fontWeight: "900" },
});

