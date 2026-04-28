import { Audio } from "expo-av";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";

type AgentResponse = {
  replyText: string;
  audioBase64?: string | null;
  actions?: Array<{ tool: string; ok: boolean; detail: string }>;
};

function cleanText(t: string) {
  return t
    .replace(/[*_`#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function AgentScreen() {
  const params = useLocalSearchParams<{ prompt?: string }>();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [typedInput, setTypedInput] = useState("");
  const [reply, setReply] = useState(
    "I can log meals, fetch glucose context, and adjust plan tasks by voice.",
  );
  const [actions, setActions] = useState<Array<{ tool: string; ok: boolean; detail: string }>>([]);

  const bars = useRef([...Array(16)].map(() => new Animated.Value(0.4))).current;

  function animateBars() {
    bars.forEach((b, idx) => {
      b.stopAnimation();
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, {
            toValue: 0.2 + ((idx % 5) / 5),
            duration: 220 + idx * 8,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(b, {
            toValue: 1,
            duration: 260 + idx * 9,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    });
  }

  function stopBars() {
    bars.forEach((b) => b.stopAnimation());
  }

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
      return "Network request failed. Check phone internet, Expo connection mode (Tunnel if needed), and Supabase URL/key in .env.";
    }
    return msg;
  }

  async function runTranscript(transcript: string) {
    setStatus("Executing");
    const { data: aData, error: aErr } = await supabase.functions.invoke("voice-agent", {
      body: { transcript },
    });
    if (aErr) throw aErr;

    const payload = aData as AgentResponse;
    setReply(cleanText(payload.replyText || "Done."));
    setActions(payload.actions ?? []);

    if (payload.audioBase64) {
      setSpeaking(true);
      setStatus("Speaking");
      animateBars();
      const sound = new Audio.Sound();
      const dataUri = `data:audio/mpeg;base64,${payload.audioBase64}`;
      await sound.loadAsync({ uri: dataUri });
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded || !s.didJustFinish) return;
        setSpeaking(false);
        setStatus("Ready");
        stopBars();
        void sound.unloadAsync();
      });
    } else {
      setStatus("Ready");
      stopBars();
    }
  }

  async function submitTyped() {
    const transcript = typedInput.trim();
    if (!transcript || busy || speaking) return;
    setBusy(true);
    try {
      void Haptics.selectionAsync();
      await runTranscript(transcript);
      setTypedInput("");
    } catch (e) {
      setStatus(`Error: ${readableError(e)}`);
      setSpeaking(false);
      stopBars();
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const p = typeof params.prompt === "string" ? params.prompt.trim() : "";
    if (!p) return;
    setTypedInput(p);
    setStatus("Swap context ready");
  }, [params.prompt]);

  async function beginRecording() {
    if (busy || recording) return;
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      setStatus("Mic permission required");
      return;
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await rec.startAsync();
    setRecording(rec);
    setStatus("Listening");
    animateBars();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }

  async function endRecordingAndRun() {
    if (!recording || busy) return;
    setBusy(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error("No audio recorded");

      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Not signed in");

      const path = `${uid}/${Date.now()}-agent.m4a`;
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      const bytes = b64ToBytes(base64);
      const { error: upErr } = await supabase.storage.from("meal-images").upload(path, bytes, {
        contentType: "audio/m4a",
        upsert: true,
      });
      if (upErr) throw upErr;

      setStatus("Transcribing");
      const { data: tData, error: tErr } = await supabase.functions.invoke("transcribe-meal-audio", {
        body: { storage_path: path },
      });
      if (tErr) throw tErr;
      const transcript = (tData as { text?: string }).text?.trim();
      if (!transcript) throw new Error("Could not transcribe audio");

      await runTranscript(transcript);
    } catch (e) {
      setStatus(`Error: ${readableError(e)}`);
      setRecording(null);
      setSpeaking(false);
      stopBars();
    } finally {
      setBusy(false);
    }
  }

  const micLabel = useMemo(() => {
    if (busy) return "Processing";
    if (recording) return "Release to send";
    return "Hold to talk";
  }, [busy, recording]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Voice Agent</Text>
      <Text style={styles.lead}>Dedicated execution page for voice-driven commands.</Text>

      <View style={styles.visualCard}>
        <View style={styles.visualizerWrap}>
          {bars.map((b, i) => (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  transform: [{ scaleY: b }],
                },
              ]}
            />
          ))}
        </View>
        <Text style={styles.state}>{status}</Text>
      </View>

      <Pressable
        style={[styles.micBtn, (busy || speaking) && styles.micBtnDisabled]}
        onPressIn={beginRecording}
        onPressOut={endRecordingAndRun}
        disabled={busy || speaking}
      >
        <Text style={styles.micText}>{micLabel}</Text>
      </Pressable>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type command: log 2 eggs and toast"
          placeholderTextColor={theme.colors.textMuted}
          value={typedInput}
          onChangeText={setTypedInput}
          editable={!busy && !speaking}
        />
        <Pressable style={styles.sendBtn} onPress={submitTyped} disabled={!typedInput.trim() || busy || speaking}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>

      {(busy || speaking) ? <ActivityIndicator color={theme.colors.text} /> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Reply</Text>
        <Text style={styles.reply}>{reply}</Text>
      </View>

      {actions.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actions completed</Text>
          <Text style={styles.item}>
            {actions.filter((a) => a.ok).length} action(s) completed.
          </Text>
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
  visualCard: {
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    gap: 10,
  },
  visualizerWrap: { flexDirection: "row", gap: 6, alignItems: "center", height: 80 },
  bar: {
    width: 8,
    height: 70,
    borderRadius: 3,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.text,
  },
  state: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: "monospace",
  },
  micBtn: {
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.text,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  micBtnDisabled: { opacity: 0.7 },
  micText: { color: theme.colors.text, fontWeight: "800", fontSize: 16 },
  inputRow: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: theme.colors.bgPure,
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    borderWidth: 1,
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  sendText: { color: theme.colors.text, fontWeight: "800" },
  card: {
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  cardTitle: { fontSize: 12, textTransform: "uppercase", fontWeight: "800", color: theme.colors.textMuted },
  reply: { fontSize: 15, color: theme.colors.text },
  item: { fontSize: 13, color: theme.colors.textMuted },
});
