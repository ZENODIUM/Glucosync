import { useEffect, useMemo, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { Image, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import type { AgentEvent, GlucoseReading, MealLog } from "../../lib/types";

const POLLINATIONS_KEY = process.env.EXPO_PUBLIC_POLLINATIONS_KEY ?? "";

function fmtTime(ts: string) {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function TrendBars({ values }: { values: number[] }) {
  const min = Math.min(...values, 70);
  const max = Math.max(...values, 140);
  const span = Math.max(max - min, 1);

  return (
    <View style={styles.chartWrap}>
      <View style={styles.yAxis}>
        <Text style={styles.axisText}>{max}</Text>
        <Text style={styles.axisText}>{Math.round((max + min) / 2)}</Text>
        <Text style={styles.axisText}>{min}</Text>
      </View>
      <View style={styles.barsRow}>
        {values.map((v, i) => {
          const pct = (v - min) / span;
          const h = 16 + pct * 72;
          return <View key={`${v}-${i}`} style={[styles.bar, { height: h }]} />;
        })}
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const isFocused = useIsFocused();
  const [loading, setLoading] = useState(false);
  const [glucose, setGlucose] = useState<GlucoseReading[]>([]);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [mealThumbs, setMealThumbs] = useState<Record<string, string>>({});
  const [activeMeal, setActiveMeal] = useState<MealLog | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editFoods, setEditFoods] = useState("");
  const [editKcal, setEditKcal] = useState("");
  const [editProtein, setEditProtein] = useState("");
  const [editCarb, setEditCarb] = useState("");
  const [editFat, setEditFat] = useState("");
  const [savingMeal, setSavingMeal] = useState(false);
  const [failedThumbs, setFailedThumbs] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const [g, m, e] = await Promise.all([
      supabase.from("glucose_readings").select("id,ts,mg_dl,source").order("ts", { ascending: false }).limit(28),
      supabase
        .from("meal_logs")
        .select("id,created_at,ai_summary,scan_mode,image_path,raw_transcript,parsed_json")
        .order("created_at", { ascending: false })
        .limit(64),
      supabase.from("agent_events").select("id,created_at,transcript,reply_text,actions_json").order("created_at", { ascending: false }).limit(16),
    ]);
    if (!g.error) setGlucose((g.data ?? []) as GlucoseReading[]);
    if (!m.error) {
      const mealRows = (m.data ?? []) as MealLog[];
      setMeals(mealRows);

      const imageRows = mealRows.filter((x) => x.image_path).slice(0, 16);
      if (imageRows.length) {
        const { data: urls } = await supabase.storage
          .from("meal-images")
          .createSignedUrls(imageRows.map((r) => String(r.image_path)), 60 * 60);
        const map: Record<string, string> = {};
        imageRows.forEach((row, idx) => {
          const signed = urls?.[idx]?.signedUrl;
          if (signed) map[row.id] = signed;
        });
        setMealThumbs(map);
      }
    }
    if (!e.error) setEvents((e.data ?? []) as AgentEvent[]);
    setLoading(false);
  }

  useEffect(() => {
    if (isFocused) void load();
  }, [isFocused]);

  const trendValues = useMemo(() => glucose.slice(0, 24).reverse().map((r) => r.mg_dl), [glucose]);
  const avg = trendValues.length ? Math.round(trendValues.reduce((a, b) => a + b, 0) / trendValues.length) : null;
  const high = trendValues.length ? Math.max(...trendValues) : null;
  const low = trendValues.length ? Math.min(...trendValues) : null;
  const mealConsistency = useMemo(() => {
    const now = new Date();
    let activeDays = 0;
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).toISOString().slice(0, 10);
      const hasMeal = meals.some((m) => m.created_at.slice(0, 10) === d);
      if (hasMeal) activeDays += 1;
    }
    return Math.round((activeDays / 7) * 100);
  }, [meals]);
  const trendTimes = useMemo(() => glucose.slice(0, 24).reverse().map((g) => g.ts), [glucose]);

  function openMeal(meal: MealLog) {
    setActiveMeal(meal);
    setEditSummary(meal.ai_summary ?? "");
    const foods = (meal.parsed_json?.foods ?? []).map((f) => f.name).filter(Boolean).join(", ");
    setEditFoods(foods);
    setEditKcal(String(meal.parsed_json?.macros?.kcal ?? ""));
    setEditProtein(String(meal.parsed_json?.macros?.proteinG ?? ""));
    setEditCarb(String(meal.parsed_json?.macros?.carbG ?? ""));
    setEditFat(String(meal.parsed_json?.macros?.fatG ?? ""));
  }

  async function saveMealEdits() {
    if (!activeMeal) return;
    setSavingMeal(true);
    try {
      const foods = editFoods
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
      const parsed = {
        ...(activeMeal.parsed_json ?? {}),
        foods,
        macros: {
          kcal: Number(editKcal || 0) || undefined,
          proteinG: Number(editProtein || 0) || undefined,
          carbG: Number(editCarb || 0) || undefined,
          fatG: Number(editFat || 0) || undefined,
        },
        summary: editSummary,
      };
      const { error } = await supabase
        .from("meal_logs")
        .update({ ai_summary: editSummary, parsed_json: parsed })
        .eq("id", activeMeal.id);
      if (error) throw error;
      setMeals((prev) => prev.map((m) => (m.id === activeMeal.id ? { ...m, ai_summary: editSummary, parsed_json: parsed } : m)));
      setActiveMeal(null);
    } finally {
      setSavingMeal(false);
    }
  }

  function mealFallbackThumb(meal: MealLog) {
    const raw =
      (meal.parsed_json?.foods ?? []).map((f) => f.name).filter(Boolean).join(",") ||
      meal.raw_transcript ||
      "healthy meal";
    const prompt = `top-down food photo, realistic, appetizing, ${raw.replace(/[^a-zA-Z0-9,\s-]/g, "").trim() || "healthy meal"}`;
    const q = encodeURIComponent(prompt);
    const keyPart = POLLINATIONS_KEY ? `&key=${encodeURIComponent(POLLINATIONS_KEY)}` : "";
    return `https://gen.pollinations.ai/image/${q}?model=zimage&width=512&height=336&nologo=true${keyPart}`;
  }

  function backupThumb(meal: MealLog) {
    const seed = encodeURIComponent(
      (meal.parsed_json?.foods ?? []).map((f) => f.name).filter(Boolean).join("-") || meal.id,
    );
    return `https://picsum.photos/seed/${seed}/512/336`;
  }

  function mealTitle(meal: MealLog) {
    const names = (meal.parsed_json?.foods ?? [])
      .map((f) => (f.name ?? "").trim())
      .filter(Boolean);
    if (names.length) {
      return names.slice(0, 3).join(", ");
    }
    return meal.ai_summary ?? "Meal logged";
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
    >
      <Text style={styles.h1}>History</Text>
      <Text style={styles.sub}>PAST TRENDS + ACTION TIMELINE</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Glucose Trend (latest 24 points)</Text>
        {trendValues.length ? (
          <>
            <TrendBars values={trendValues} />
            <View style={styles.xAxis}>
              <Text style={styles.axisText}>{trendTimes[0] ? new Date(trendTimes[0]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</Text>
              <Text style={styles.axisText}>{trendTimes[Math.floor(trendTimes.length / 2)] ? new Date(trendTimes[Math.floor(trendTimes.length / 2)]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</Text>
              <Text style={styles.axisText}>{trendTimes[trendTimes.length - 1] ? new Date(trendTimes[trendTimes.length - 1]).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.stat}>Avg {avg} mg/dL</Text>
              <Text style={styles.stat}>Low {low}</Text>
              <Text style={styles.stat}>High {high}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.empty}>No glucose data yet.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Adherence Score</Text>
        <Text style={styles.score}>{mealConsistency}%</Text>
        <Text style={styles.scoreHint}>Days in last week with at least one logged meal.</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Meal Log Timeline</Text>
        {meals.length ? (
          meals.slice(0, 16).map((m) => (
            <Pressable key={m.id} style={styles.row} onPress={() => openMeal(m)}>
              <Image
                source={{ uri: failedThumbs[m.id] ? backupThumb(m) : mealThumbs[m.id] ?? mealFallbackThumb(m) }}
                style={styles.thumb}
                onError={() => setFailedThumbs((prev) => ({ ...prev, [m.id]: true }))}
              />
              <Text style={styles.rowHead}>{fmtTime(m.created_at)}</Text>
              <Text style={styles.rowBody}>{mealTitle(m)}</Text>
              <Text style={styles.rowBodyMuted}>Tap to view/edit nutrition details</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.empty}>No meals logged yet.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Voice Agent Sessions</Text>
        {events.length ? (
          events.map((ev) => (
            <View key={ev.id} style={styles.row}>
              <Text style={styles.rowHead}>{fmtTime(ev.created_at)}</Text>
              <Text style={styles.rowBody}>You: {ev.transcript}</Text>
              <Text style={styles.rowBodyMuted}>Agent: {ev.reply_text}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No voice-agent sessions yet.</Text>
        )}
      </View>

      <Modal visible={Boolean(activeMeal)} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>Meal details (editable)</Text>
            <TextInput style={styles.input} value={editSummary} onChangeText={setEditSummary} placeholder="Summary" />
            <TextInput
              style={[styles.input, { minHeight: 64 }]}
              value={editFoods}
              onChangeText={setEditFoods}
              placeholder="Foods, comma separated"
              multiline
            />
            <View style={styles.macroRow}>
              <TextInput style={styles.inputSmall} value={editKcal} onChangeText={setEditKcal} placeholder="kcal" keyboardType="numeric" />
              <TextInput style={styles.inputSmall} value={editProtein} onChangeText={setEditProtein} placeholder="protein g" keyboardType="numeric" />
              <TextInput style={styles.inputSmall} value={editCarb} onChangeText={setEditCarb} placeholder="carb g" keyboardType="numeric" />
              <TextInput style={styles.inputSmall} value={editFat} onChangeText={setEditFat} placeholder="fat g" keyboardType="numeric" />
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setActiveMeal(null)}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={() => void saveMealEdits()} disabled={savingMeal}>
                <Text style={styles.saveText}>{savingMeal ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 18, paddingBottom: 120, gap: 14 },
  h1: { fontSize: 30, fontWeight: "900", letterSpacing: -0.8, color: theme.colors.text },
  sub: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1, color: theme.colors.textMuted },
  card: {
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  cardTitle: { fontSize: 13, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" },
  chartWrap: { flexDirection: "row", gap: 8, alignItems: "stretch" },
  yAxis: { justifyContent: "space-between", paddingVertical: 6 },
  barsRow: {
    flex: 1,
    minHeight: 88,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  bar: { width: 8, borderRadius: 2, backgroundColor: theme.colors.accent },
  xAxis: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  axisText: { fontFamily: "monospace", fontSize: 11, color: theme.colors.textMuted },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  stat: { fontFamily: "monospace", fontWeight: "700", color: theme.colors.text },
  score: { fontFamily: "monospace", fontSize: 36, fontWeight: "900", color: theme.colors.text },
  scoreHint: { fontSize: 13, color: theme.colors.textMuted },
  row: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8, gap: 3 },
  rowHead: { fontFamily: "monospace", fontSize: 12, color: theme.colors.textMuted },
  rowBody: { fontSize: 14, color: theme.colors.text, fontWeight: "600" },
  rowBodyMuted: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  empty: { color: theme.colors.textMuted, fontSize: 14 },
  thumb: { width: "100%", height: 96, borderRadius: 6, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.bg },
  modalBg: { flex: 1, backgroundColor: theme.colors.overlay, justifyContent: "center", padding: 18 },
  modalCard: {
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.bgPure,
  },
  macroRow: { flexDirection: "row", gap: 6 },
  inputSmall: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    color: theme.colors.text,
    backgroundColor: theme.colors.bgPure,
    fontSize: 12,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 4 },
  ghostBtn: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  ghostText: { color: theme.colors.text, fontWeight: "700" },
  saveBtn: { borderWidth: 1, borderColor: theme.colors.text, backgroundColor: theme.colors.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  saveText: { color: theme.colors.text, fontWeight: "900" },
});
