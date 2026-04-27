import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../../lib/supabase";

type ScanMode = "plate" | "menu";

export default function LensScreen() {
  const [mode, setMode] = useState<ScanMode>("plate");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | undefined>();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  async function ensureCamPerm() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera", "Camera permission is needed to scan meals.");
      return false;
    }
    return true;
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Photos", "Photo library permission is needed.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.7,
    });
    if (picked.canceled || !picked.assets[0]) return;
    await runAnalyze(picked.assets[0].uri, picked.assets[0].mimeType ?? "image/jpeg");
  }

  async function captureCamera() {
    if (!(await ensureCamPerm())) return;
    const shot = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (shot.canceled || !shot.assets[0]) return;
    await runAnalyze(shot.assets[0].uri, shot.assets[0].mimeType ?? "image/jpeg");
  }

  async function runAnalyze(uri: string, mime: string) {
    setBusy(true);
    setResult(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const ext = mime.includes("png") ? "png" : "jpg";
      const path = `${uid}/${Date.now()}.${ext}`;
      const res = await fetch(uri);
      const blob = await res.blob();

      const { error: upErr } = await supabase.storage.from("meal-images").upload(path, blob, {
        contentType: mime,
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("analyze-meal-image", {
        body: { storage_path: path, scan_mode: mode },
      });
      if (error) throw error;
      setResult(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Lens", msg);
    } finally {
      setBusy(false);
    }
  }

  async function startVoice() {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Microphone", "Microphone permission is needed for voice logs.");
      return;
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    setRecording(rec);
  }

  async function stopVoiceAndParse() {
    if (!recording) return;
    setVoiceBusy(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(undefined);
      if (!uri) throw new Error("No audio file");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const path = `${uid}/${Date.now()}.m4a`;
      const res = await fetch(uri);
      const blob = await res.blob();
      const { error: upErr } = await supabase.storage.from("meal-images").upload(path, blob, {
        contentType: "audio/m4a",
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data: tr, error: trErr } = await supabase.functions.invoke("transcribe-meal-audio", {
        body: { storage_path: path },
      });
      if (trErr) throw trErr;
      const text = (tr as { text?: string }).text;
      if (!text) throw new Error("Empty transcript");

      const { data: parsed, error: pErr } = await supabase.functions.invoke("parse-meal-text", {
        body: { text },
      });
      if (pErr) throw pErr;
      setResult(parsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Voice log", msg);
    } finally {
      setVoiceBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Lens</Text>
      <Text style={styles.lead}>
        Snap a plate, scan a menu photo, or speak a quick meal note. Menu mode returns a
        ranked list (no live AR overlay in MVP).
      </Text>

      <View style={styles.segment}>
        <Pressable
          style={[styles.segBtn, mode === "plate" && styles.segBtnOn]}
          onPress={() => setMode("plate")}
        >
          <Text style={[styles.segText, mode === "plate" && styles.segTextOn]}>Plate</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, mode === "menu" && styles.segBtnOn]}
          onPress={() => setMode("menu")}
        >
          <Text style={[styles.segText, mode === "menu" && styles.segTextOn]}>Menu</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Pressable style={styles.primary} onPress={captureCamera} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? "Working…" : "Open camera"}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={pickFromLibrary} disabled={busy}>
          <Text style={styles.secondaryText}>Photo library</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>Voice log</Text>
      {!recording ? (
        <Pressable
          style={styles.mic}
          onPress={startVoice}
          disabled={voiceBusy || busy}
        >
          <Text style={styles.micText}>{voiceBusy ? "Processing…" : "Hold to record — tap to start"}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.stop} onPress={stopVoiceAndParse} disabled={voiceBusy}>
          <Text style={styles.stopText}>{voiceBusy ? "Transcribing…" : "Stop & log meal"}</Text>
        </Pressable>
      )}

      {busy || voiceBusy ? (
        <ActivityIndicator style={{ marginTop: 16 }} color="#1b7a5c" />
      ) : null}

      {result ? (
        <View style={styles.out}>
          <Text style={styles.section}>Latest result</Text>
          <Text selectable style={styles.json}>
            {JSON.stringify(result, null, 2)}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f2" },
  content: { padding: 20, paddingBottom: 48, gap: 14 },
  h1: { fontSize: 26, fontWeight: "700", color: "#0d3d2c" },
  lead: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  segment: { flexDirection: "row", backgroundColor: "#dfece5", borderRadius: 12, padding: 4 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  segBtnOn: { backgroundColor: "#fff" },
  segText: { fontSize: 15, color: "#4a6a5e", fontWeight: "600" },
  segTextOn: { color: "#0d3d2c" },
  row: { flexDirection: "row", gap: 10 },
  primary: {
    flex: 1,
    backgroundColor: "#1b7a5c",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#1b7a5c",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryText: { color: "#1b7a5c", fontSize: 16, fontWeight: "700" },
  section: { fontSize: 17, fontWeight: "700", color: "#0d3d2c", marginTop: 6 },
  mic: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#c5d6cc",
  },
  micText: { fontSize: 15, color: "#2f4a3f", textAlign: "center" },
  stop: {
    backgroundColor: "#c45c3a",
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
  },
  stopText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  out: { marginTop: 8, gap: 8 },
  json: { fontSize: 12, color: "#1f332b", backgroundColor: "#fff", padding: 12, borderRadius: 12 },
});
