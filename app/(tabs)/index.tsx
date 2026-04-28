import { Audio } from "expo-av";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

type AgentResponse = {
  replyText: string;
  audioBase64?: string | null;
  actions?: Array<{ tool: string; ok: boolean; detail: string }>;
  proactivePrompt?: string | null;
};

function usePulse(active: boolean) {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1.08,
          duration: 560,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 1,
          duration: 560,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, value]);
  return value;
}

export default function VoiceAgentScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [lastReply, setLastReply] = useState(
    "Hi, I am your GlucoSync voice agent. Tap and hold to speak.",
  );
  const [proactive, setProactive] = useState<string | null>(null);
  const [actions, setActions] = useState<Array<{ tool: string; ok: boolean; detail: string }>>([]);

  const pulse = usePulse(Boolean(recording) || speaking || busy);

  useEffect(() => {
    let mounted = true;
    async function checkProactive() {
      try {
        const { data, error } = await supabase.functions.invoke("voice-agent", {
          body: { transcript: "status check" },
        });
        if (error || !mounted) return;
        const payload = data as AgentResponse;
        if (payload.proactivePrompt) setProactive(payload.proactivePrompt);
      } catch {
        // no-op
      }
    }
    void checkProactive();
    const id = setInterval(() => {
      void checkProactive();
    }, 15 * 60 * 1000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

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
    setStatus("Listening...");
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
      const fileRes = await fetch(uri);
      const blob = await fileRes.blob();
      const { error: upErr } = await supabase.storage.from("meal-images").upload(path, blob, {
        contentType: "audio/m4a",
        upsert: true,
      });
      if (upErr) throw upErr;

      setStatus("Transcribing...");
      const { data: tData, error: tErr } = await supabase.functions.invoke("transcribe-meal-audio", {
        body: { storage_path: path },
      });
      if (tErr) throw tErr;
      const transcript = (tData as { text?: string }).text?.trim();
      if (!transcript) throw new Error("Could not transcribe audio");

      setStatus("Thinking...");
      const { data: aData, error: aErr } = await supabase.functions.invoke("voice-agent", {
        body: { transcript },
      });
      if (aErr) throw aErr;
      const payload = aData as AgentResponse;

      setLastReply(payload.replyText || "Done.");
      setActions(payload.actions ?? []);
      setProactive(payload.proactivePrompt ?? null);

      if (payload.audioBase64) {
        setStatus("Speaking...");
        setSpeaking(true);
        const sound = new Audio.Sound();
        const dataUri = `data:audio/mpeg;base64,${payload.audioBase64}`;
        await sound.loadAsync({ uri: dataUri });
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((s) => {
          if (!s.isLoaded || !s.didJustFinish) return;
          setSpeaking(false);
          setStatus("Ready");
          void sound.unloadAsync();
        });
      } else {
        setStatus("Ready");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus(`Error: ${msg}`);
      setRecording(null);
      setSpeaking(false);
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
      <Text style={styles.lead}>
        Speak naturally. I can log meals, check glucose status, and update your meal plan.
      </Text>

      <View style={styles.visualCard}>
        <Animated.View style={[styles.pulseOuter, { transform: [{ scale: pulse }] }]}>
          <View style={styles.pulseMiddle}>
            <View style={styles.pulseInner} />
          </View>
        </Animated.View>
        <Text style={styles.state}>{status}</Text>
      </View>

      {proactive ? (
        <View style={styles.proactive}>
          <Text style={styles.proactiveTitle}>Proactive prompt</Text>
          <Text style={styles.proactiveText}>{proactive}</Text>
        </View>
      ) : null}

      <Pressable
        style={[styles.micBtn, (busy || speaking) && styles.micBtnDisabled]}
        onPressIn={beginRecording}
        onPressOut={endRecordingAndRun}
        disabled={busy || speaking}
      >
        <Text style={styles.micText}>{micLabel}</Text>
      </Pressable>

      {(busy || speaking) ? <ActivityIndicator color="#1b7a5c" /> : null}

      <View style={styles.replyCard}>
        <Text style={styles.replyTitle}>Agent reply</Text>
        <Text style={styles.replyBody}>{lastReply}</Text>
      </View>

      {actions.length > 0 ? (
        <View style={styles.actionsCard}>
          <Text style={styles.replyTitle}>Actions executed</Text>
          {actions.map((a, idx) => (
            <Text key={`${a.tool}-${idx}`} style={styles.actionItem}>
              • {a.tool}: {a.ok ? "ok" : "failed"} — {a.detail}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f1714" },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  h1: { fontSize: 28, fontWeight: "700", color: "#eaf7f1" },
  lead: { fontSize: 15, color: "#b8cbc3", lineHeight: 22 },
  visualCard: {
    backgroundColor: "#151f1b",
    borderWidth: 1,
    borderColor: "#24342e",
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  pulseOuter: {
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(27,122,92,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseMiddle: {
    width: 122,
    height: 122,
    borderRadius: 61,
    backgroundColor: "rgba(27,122,92,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: "#1b7a5c",
  },
  state: { color: "#d7ebe3", fontSize: 14, fontWeight: "600" },
  proactive: {
    backgroundColor: "#172520",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#29443a",
    gap: 6,
  },
  proactiveTitle: { color: "#9fe3c8", fontWeight: "700", fontSize: 13, textTransform: "uppercase" },
  proactiveText: { color: "#d7ebe3", fontSize: 15, lineHeight: 22 },
  micBtn: {
    backgroundColor: "#1b7a5c",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  micBtnDisabled: { opacity: 0.7 },
  micText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  replyCard: {
    backgroundColor: "#151f1b",
    borderWidth: 1,
    borderColor: "#24342e",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  actionsCard: {
    backgroundColor: "#151f1b",
    borderWidth: 1,
    borderColor: "#24342e",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  replyTitle: { color: "#9fe3c8", fontWeight: "700", fontSize: 13, textTransform: "uppercase" },
  replyBody: { color: "#eaf7f1", fontSize: 15, lineHeight: 22 },
  actionItem: { color: "#c6dad2", fontSize: 13, lineHeight: 20 },
});
