import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { useSession } from "../lib/session";
import { theme } from "../lib/theme";

const PREFS = [
  "Balanced",
  "Vegetarian",
  "Vegan",
  "Keto",
  "Low carb",
  "Mediterranean",
  "High protein",
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { session, refreshProfile } = useSession();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(["Balanced"]);
  const [glp1, setGlp1] = useState(false);
  const [sensorDone, setSensorDone] = useState(false);
  const [health, setHealth] = useState(false);
  const [pairBusy, setPairBusy] = useState(false);
  const [finishBusy, setFinishBusy] = useState(false);

  function togglePref(p: string) {
    setSelected((prev) => {
      if (p === "Balanced") return ["Balanced"];
      const without = prev.filter((x) => x !== "Balanced");
      if (without.includes(p)) return without.filter((x) => x !== p);
      return [...without, p];
    });
  }

  async function simulatePair() {
    setPairBusy(true);
    await new Promise((r) => setTimeout(r, 1200));
    setPairBusy(false);
    setSensorDone(true);
  }

  async function finish() {
    const uid = session?.user?.id;
    if (!uid) return;
    setFinishBusy(true);
    const prefsLower = selected.map((s) => s.toLowerCase());
    const { error: upErr } = await supabase
      .from("profiles")
      .update({
        dietary_preferences: prefsLower,
        glp1_mode: glp1,
        health_sync_enabled: health,
        onboarding_completed: true,
      })
      .eq("id", uid);
    if (upErr) {
      setFinishBusy(false);
      return;
    }
    await supabase.rpc("seed_mock_glucose");
    await refreshProfile();
    setFinishBusy(false);
    router.replace("/(tabs)");
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.kicker}>Step {step + 1} of 4</Text>
        <Text style={styles.title}>
          {step === 0 && "How do you like to eat?"}
          {step === 1 && "GLP-1 medications"}
          {step === 2 && "Connect your CGM (simulated)"}
          {step === 3 && "Optional sync"}
        </Text>

        {step === 0 ? (
          <View style={styles.chips}>
            {PREFS.map((p) => {
              const on = selected.includes(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => togglePref(p)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{p}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.block}>
            <Text style={styles.body}>
              If you use Ozempic, Wegovy, Mounjaro, or similar GLP-1 therapies, we prioritize
              protein density and smaller portions.
            </Text>
            <Pressable
              onPress={() => setGlp1(!glp1)}
              style={[styles.toggleRow, glp1 && styles.toggleRowOn]}
            >
              <Text style={styles.toggleLabel}>GLP-1 companion mode</Text>
              <Text style={styles.toggleValue}>{glp1 ? "On" : "Off"}</Text>
            </Pressable>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.block}>
            <Text style={styles.body}>
              MVP uses mock glucose data. This screen simulates pairing a Dexcom Stelo or
              Abbott Lingo sensor—no Bluetooth yet.
            </Text>
            <Pressable
              style={[styles.button, (pairBusy || sensorDone) && styles.buttonGhost]}
              onPress={simulatePair}
              disabled={pairBusy || sensorDone}
            >
              {sensorDone ? (
                <Text style={styles.buttonText}>Sensor paired (simulated)</Text>
              ) : pairBusy ? (
                <ActivityIndicator color={theme.colors.text} />
              ) : (
                <Text style={styles.buttonText}>Simulate sensor pairing</Text>
              )}
            </Pressable>
          </View>
        ) : null}

        {step === 3 ? (
          <View style={styles.block}>
            <Text style={styles.body}>
              Apple Health and Oura sync are coming soon. Toggle is for UI only in this
              build.
            </Text>
            <Pressable
              onPress={() => setHealth(!health)}
              style={[styles.toggleRow, health && styles.toggleRowOn]}
            >
              <Text style={styles.toggleLabel}>Sleep & cycle sync</Text>
              <Text style={styles.toggleValue}>{health ? "Interested" : "Not now"}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.nav}>
          {step > 0 ? (
            <Pressable style={styles.secondary} onPress={() => setStep((s) => s - 1)}>
              <Text style={styles.secondaryText}>Back</Text>
            </Pressable>
          ) : (
            <View style={styles.spacer} />
          )}
          {step < 3 ? (
            <Pressable
              style={styles.button}
              onPress={() => {
                if (step === 2 && !sensorDone) return;
                setStep((s) => s + 1);
              }}
            >
              <Text style={styles.buttonText}>Continue</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.button, finishBusy && styles.buttonDisabled]}
              onPress={finish}
              disabled={finishBusy}
            >
              {finishBusy ? (
                <ActivityIndicator color={theme.colors.text} />
              ) : (
                <Text style={styles.buttonText}>Enter GlucoSync</Text>
              )}
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: 18, paddingTop: 56, gap: 14, paddingBottom: 40 },
  kicker: { color: theme.colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1.1, textTransform: "uppercase" },
  title: { fontSize: 28, fontWeight: "900", letterSpacing: -0.8, color: theme.colors.text, marginBottom: 6 },
  body: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  block: { gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.bgPure,
  },
  chipOn: { borderColor: theme.colors.text, backgroundColor: theme.colors.accent },
  chipText: { color: theme.colors.text, fontSize: 14, fontWeight: "700" },
  chipTextOn: { color: theme.colors.text, fontWeight: "900" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgPure,
  },
  toggleRowOn: { borderColor: theme.colors.text, backgroundColor: theme.colors.accent },
  toggleLabel: { fontSize: 15, color: theme.colors.text, fontWeight: "800" },
  toggleValue: { fontSize: 13, color: theme.colors.text, fontWeight: "900", fontFamily: "monospace" },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  spacer: { flex: 1 },
  button: {
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.text,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    minWidth: 140,
    alignItems: "center",
  },
  buttonGhost: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.text, fontSize: 16, fontWeight: "900" },
  secondary: { paddingVertical: 12, paddingHorizontal: 8 },
  secondaryText: { color: theme.colors.text, fontSize: 15, fontWeight: "800" },
});
