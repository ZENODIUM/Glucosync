import { useState } from "react";
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
import { supabase } from "../lib/supabase";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

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
          Sign in with email OTP. We send a one-time code and you paste it here.
        </Text>

        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@email.com"
          placeholderTextColor="#7a8a82"
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
              placeholderTextColor="#7a8a82"
              value={code}
              onChangeText={setCode}
              maxLength={10}
            />
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={verifyCode}
              disabled={busy}
            >
              <Text style={styles.buttonText}>{busy ? "Verifying…" : "Verify and sign in"}</Text>
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
  root: { flex: 1, backgroundColor: "#eef6f2", justifyContent: "center", padding: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    gap: 14,
    borderWidth: 1,
    borderColor: "#d9e8df",
  },
  title: { fontSize: 28, fontWeight: "700", color: "#0d3d2c" },
  sub: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  input: {
    borderWidth: 1,
    borderColor: "#c5d6cc",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0d1f18",
  },
  button: {
    backgroundColor: "#1b7a5c",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  note: { fontSize: 14, color: "#2f5c4a", lineHeight: 20 },
  link: { color: "#1b7a5c", fontSize: 15, textAlign: "center", marginTop: 4 },
});
