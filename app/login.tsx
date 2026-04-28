import { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../lib/supabase";
import { theme } from "../lib/theme";
import { useSession } from "../lib/session";

export default function LoginScreen() {
  const router = useRouter();
  const { session } = useSession();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) {
      router.replace("/");
    }
  }, [router, session]);

  async function sendCode() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      Alert.alert("Email required", "Enter the email you use for GlucoSync.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (error) {
      Alert.alert("Could not send code", error.message);
      return;
    }
    setSent(true);
  }

  async function verifyCode() {
    const trimmed = email.trim().toLowerCase();
    const c = code.trim();
    if (!trimmed || c.length < 6) {
      Alert.alert("Check code", "Enter the code from your email.");
      return;
    }

    setBusy(true);

    const attempts: Array<"email" | "magiclink" | "signup"> = [
      "email",
      "magiclink",
      "signup",
    ];

    let lastError: string | null = null;
    for (const type of attempts) {
      const { error } = await supabase.auth.verifyOtp({
        email: trimmed,
        token: c,
        type,
      });
      if (!error) {
        setBusy(false);
        router.replace("/");
        return;
      }
      lastError = error.message;
    }

    setBusy(false);
    Alert.alert("Invalid code", lastError ?? "Code expired or invalid.");
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>GlucoSync</Text>
        <Text style={styles.sub}>
          One email flow for both sign in and register. We send a one-time code and you paste it here.
        </Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
          placeholderTextColor={theme.colors.textMuted}
          value={email}
          onChangeText={setEmail}
          editable={!sent}
        />

        {!sent ? (
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={sendCode}
            disabled={busy}
          >
            <Text style={styles.buttonText}>{busy ? "Sending…" : "Send code"}</Text>
          </Pressable>
        ) : (
          <>
            <Text style={styles.note}>Enter the code from your email.</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="123456"
              placeholderTextColor={theme.colors.textMuted}
              value={code}
              onChangeText={setCode}
              maxLength={10}
            />
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={verifyCode}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{busy ? "Verifying…" : "Verify and continue"}</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSent(false);
                setCode("");
              }}
            >
              <Text style={styles.link}>Use a different email</Text>
            </Pressable>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg, justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: theme.colors.bgPure,
    borderRadius: theme.radius.lg,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  title: { fontSize: 30, fontWeight: "900", letterSpacing: -0.8, color: theme.colors.text },
  sub: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.bgPure,
  },
  button: {
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.text,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: theme.colors.text, fontSize: 16, fontWeight: "800" },
  note: { fontSize: 14, color: theme.colors.textMuted, lineHeight: 20 },
  link: { color: theme.colors.text, fontSize: 15, textAlign: "center", marginTop: 4, fontWeight: "700" },
});
