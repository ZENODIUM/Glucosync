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
                <ActivityIndicator color="#fff" />
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
                <ActivityIndicator color="#fff" />
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
  root: { flex: 1, backgroundColor: "#eef6f2" },
  scroll: { padding: 24, paddingTop: 56, gap: 16 },
  kicker: { color: "#4a6a5e", fontSize: 14, fontWeight: "600" },
  title: { fontSize: 24, fontWeight: "700", color: "#0d3d2c", marginBottom: 8 },
  body: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  block: { gap: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderWidth: 1,
    borderColor: "#c5d6cc",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#fff",
  },
  chipOn: { borderColor: "#1b7a5c", backgroundColor: "#d9f2e8" },
  chipText: { color: "#2b3f37", fontSize: 15 },
  chipTextOn: { color: "#0d3d2c", fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#c5d6cc",
    backgroundColor: "#fff",
  },
  toggleRowOn: { borderColor: "#1b7a5c", backgroundColor: "#e9f7f1" },
  toggleLabel: { fontSize: 16, color: "#0d3d2c", fontWeight: "600" },
  toggleValue: { fontSize: 15, color: "#1b7a5c", fontWeight: "700" },
  nav: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    gap: 12,
  },
  spacer: { flex: 1 },
  button: {
    backgroundColor: "#1b7a5c",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 140,
    alignItems: "center",
  },
  buttonGhost: { backgroundColor: "#3c8f73" },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  secondary: { paddingVertical: 12, paddingHorizontal: 8 },
  secondaryText: { color: "#1b7a5c", fontSize: 16, fontWeight: "600" },
});
