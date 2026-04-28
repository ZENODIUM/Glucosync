import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";

type ScanMode = "plate" | "menu";

export default function LensScreen() {
  const [mode, setMode] = useState<ScanMode>("plate");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | undefined>();
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [text, setText] = useState("");
  const [textBusy, setTextBusy] = useState(false);
  const [actionDeadline, setActionDeadline] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);

  function b64ToBytes(b64: string) {
    const clean = b64.replace(/^data:.*;base64,/, "");
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  function readableError(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/network request failed/i.test(msg)) {
      return "Network request failed. Check phone internet, Expo mode (Tunnel if LAN fails), and Supabase URL/key in .env.";
    }
    return msg;
  }

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
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7 });
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
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = b64ToBytes(base64);

      const { error: upErr } = await supabase.storage.from("meal-images").upload(path, bytes, {
        contentType: mime,
        upsert: true,
      });
      if (upErr) throw upErr;

      const { data, error } = await supabase.functions.invoke("analyze-meal-image", {
        body: { storage_path: path, scan_mode: mode },
      });
      if (error) throw error;
      setResult(data);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Lens", readableError(e));
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
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    setRecording(rec);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = b64ToBytes(base64);
      const { error: upErr } = await supabase.storage.from("meal-images").upload(path, bytes, {
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
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Voice log", readableError(e));
    } finally {
      setVoiceBusy(false);
    }
  }

  async function runTextLog() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setTextBusy(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("parse-meal-text", {
        body: { text: trimmed },
      });
      if (error) throw error;
      setResult(data);
      setText("");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert("Text log", readableError(e));
    } finally {
      setTextBusy(false);
    }
  }

  const prediction = (() => {
    const payload = (result as any)?.result ?? result;
    const p = payload?.predictedImpact;
    if (!p) return null;
    const spike = Number(p.spikeMgDl ?? 0);
    const label = String(p.impactLabel ?? "moderate").toLowerCase();
    const tone = label === "high" ? "High" : label === "low" ? "Low" : "Moderate";
    return {
      spike,
      tone,
      action: String(p.action ?? "Keep portions steady and take a short post-meal walk."),
    };
  })();

  useEffect(() => {
    if (!prediction) return;
    const target = Date.now() + 20 * 60 * 1000;
    setActionDeadline(target);
    setRemainingSec(20 * 60);
  }, [result]); // new meal result resets action window

  useEffect(() => {
    if (!actionDeadline) return;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((actionDeadline - Date.now()) / 1000));
      setRemainingSec(left);
    }, 1000);
    return () => clearInterval(id);
  }, [actionDeadline]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Lens</Text>
      <Text style={styles.lead}>Camera and voice intake. Fast logging, zero chat clutter.</Text>

      <View style={styles.segment}>
        <Pressable style={[styles.segBtn, mode === "plate" && styles.segBtnOn]} onPress={() => setMode("plate")}>
          <Text style={styles.segText}>Plate</Text>
        </Pressable>
        <Pressable style={[styles.segBtn, mode === "menu" && styles.segBtnOn]} onPress={() => setMode("menu")}>
          <Text style={styles.segText}>Menu</Text>
        </Pressable>
      </View>

      <View style={styles.row}>
        <Pressable style={styles.primary} onPress={captureCamera} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? "Working..." : "Open camera"}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={pickFromLibrary} disabled={busy}>
          <Text style={styles.secondaryText}>Library</Text>
        </Pressable>
      </View>

      {!recording ? (
        <Pressable style={styles.voiceBtn} onPress={startVoice} disabled={voiceBusy || busy}>
          <Text style={styles.voiceText}>{voiceBusy ? "Processing..." : "Tap to start voice log"}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.stopBtn} onPress={stopVoiceAndParse} disabled={voiceBusy}>
          <Text style={styles.stopText}>{voiceBusy ? "Transcribing..." : "Stop + process"}</Text>
        </Pressable>
      )}

      <View style={styles.textCard}>
        <Text style={styles.textTitle}>Text fallback</Text>
        <TextInput
          style={styles.textInput}
          placeholder="Type a meal: 2 eggs, toast, coffee"
          placeholderTextColor={theme.colors.textMuted}
          value={text}
          onChangeText={setText}
          editable={!textBusy && !busy && !voiceBusy}
          multiline
        />
        <Pressable
          style={[styles.textBtn, (!text.trim() || textBusy) && styles.textBtnDisabled]}
          onPress={runTextLog}
          disabled={!text.trim() || textBusy || busy || voiceBusy}
        >
          <Text style={styles.textBtnText}>{textBusy ? "Logging..." : "Log text meal"}</Text>
        </Pressable>
      </View>

      {(busy || voiceBusy || textBusy) ? <ActivityIndicator color={theme.colors.text} /> : null}

      {prediction ? (
        <View style={styles.predictionCard}>
          <Text style={styles.resultTitle}>Predicted Impact</Text>
          <Text style={styles.predictionHead}>
            Predicted Spike: {prediction.tone} ({prediction.spike >= 0 ? "+" : ""}
            {prediction.spike} mg/dL)
          </Text>
          <Text style={styles.predictionBody}>Action: {prediction.action}</Text>
          <Text style={styles.predictionBody}>
            Action window: {String(Math.floor(remainingSec / 60)).padStart(2, "0")}:
            {String(remainingSec % 60).padStart(2, "0")} remaining
          </Text>
        </View>
      ) : null}

      {((result as any)?.result?.summary || (result as any)?.result?.insight) ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>Meal Insight</Text>
          {(result as any)?.result?.summary ? (
            <Text style={styles.resultBody}>{String((result as any).result.summary)}</Text>
          ) : null}
          {(result as any)?.result?.insight ? (
            <Text style={styles.resultBody}>{String((result as any).result.insight)}</Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 18, paddingBottom: 120, gap: 12 },
  h1: { fontSize: 32, fontWeight: "900", letterSpacing: -1, color: theme.colors.text },
  lead: { fontSize: 14, color: theme.colors.textMuted },
  segment: { flexDirection: "row", borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.bgPure },
  segBtn: { flex: 1, paddingVertical: 11, alignItems: "center" },
  segBtnOn: { backgroundColor: theme.colors.accent },
  segText: { color: theme.colors.text, fontWeight: "800" },
  row: { flexDirection: "row", gap: 8 },
  primary: { flex: 1, borderWidth: 1, borderColor: theme.colors.text, backgroundColor: theme.colors.accent, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  primaryText: { color: theme.colors.text, fontWeight: "800" },
  secondary: { flex: 1, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bgPure, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  secondaryText: { color: theme.colors.text, fontWeight: "700" },
  voiceBtn: { borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bgPure, borderRadius: 8, paddingVertical: 14, alignItems: "center" },
  voiceText: { color: theme.colors.text, fontWeight: "700" },
  stopBtn: { borderWidth: 1, borderColor: theme.colors.text, borderRadius: 8, paddingVertical: 14, alignItems: "center", backgroundColor: theme.colors.accent },
  stopText: { color: theme.colors.text, fontWeight: "800" },
  textCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: theme.colors.bgPure,
    gap: 8,
  },
  textTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" },
  textInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    minHeight: 70,
    color: theme.colors.text,
    backgroundColor: theme.colors.bgPure,
  },
  textBtn: {
    borderWidth: 1,
    borderColor: theme.colors.text,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: theme.colors.accent,
  },
  textBtnDisabled: { opacity: 0.6 },
  textBtnText: { color: theme.colors.text, fontWeight: "900" },
  predictionCard: {
    borderWidth: 1,
    borderColor: theme.colors.text,
    borderRadius: 8,
    padding: 12,
    backgroundColor: theme.colors.bgPure,
    gap: 6,
  },
  predictionHead: { fontSize: 15, fontWeight: "900", color: theme.colors.text },
  predictionBody: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  resultCard: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, padding: 12, backgroundColor: theme.colors.bgPure },
  resultTitle: { fontSize: 12, fontWeight: "800", color: theme.colors.textMuted, marginBottom: 6, textTransform: "uppercase" },
  resultBody: { color: theme.colors.text, fontSize: 14, lineHeight: 20 },
});
