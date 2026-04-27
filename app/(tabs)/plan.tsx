import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type { MealPlanJson, MealPlanRow } from "../../lib/types";

type Meal = MealPlanJson["days"][number]["meals"][number];

export default function PlanScreen() {
  const [row, setRow] = useState<MealPlanRow | null>(null);
  const [plan, setPlan] = useState<MealPlanJson | null>(null);
  const [view, setView] = useState<"week" | "day">("week");
  const [dayIndex, setDayIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const [swapTarget, setSwapTarget] = useState<{
    day: number;
    meal: number;
    mealObj: Meal;
  } | null>(null);
  const [swapReason, setSwapReason] = useState("");
  const [swapBusy, setSwapBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("meal_plans")
      .select("id,week_start,plan_json")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      setRow(data as MealPlanRow);
      setPlan((data as MealPlanRow).plan_json);
    } else {
      setRow(null);
      setPlan(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const days = plan?.days ?? [];
  const todayBlock = useMemo(() => {
    if (!days.length) return null;
    const safe = Math.min(dayIndex, days.length - 1);
    return days[safe];
  }, [days, dayIndex]);

  async function generate() {
    setGenBusy(true);
    try {
      const { error } = await supabase.functions.invoke("generate-meal-plan", {
        body: {},
      });
      if (error) throw error;
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Plan", msg);
    } finally {
      setGenBusy(false);
    }
  }

  async function runSwap() {
    if (!swapTarget || !plan) return;
    setSwapBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("swap-meal", {
        body: { meal: swapTarget.mealObj, reason: swapReason },
      });
      if (error) throw error;
      const alt = (data as { alternative?: Meal }).alternative;
      if (!alt?.title) throw new Error("No alternative returned");

      const merged = structuredClone(plan) as MealPlanJson;
      const d = merged.days[swapTarget.day];
      if (!d) throw new Error("Invalid day index");
      d.meals[swapTarget.meal] = { ...d.meals[swapTarget.meal], ...alt };
      setPlan(merged);

      if (row?.id) {
        const { error: upErr } = await supabase
          .from("meal_plans")
          .update({ plan_json: merged })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }

      setSwapTarget(null);
      setSwapReason("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Swap", msg);
    } finally {
      setSwapBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1b7a5c" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable
          style={[styles.toggle, view === "week" && styles.toggleOn]}
          onPress={() => setView("week")}
        >
          <Text style={[styles.toggleText, view === "week" && styles.toggleTextOn]}>Week</Text>
        </Pressable>
        <Pressable
          style={[styles.toggle, view === "day" && styles.toggleOn]}
          onPress={() => setView("day")}
        >
          <Text style={[styles.toggleText, view === "day" && styles.toggleTextOn]}>Day</Text>
        </Pressable>
        <Pressable style={styles.gen} onPress={generate} disabled={genBusy}>
          <Text style={styles.genText}>{genBusy ? "…" : "Generate"}</Text>
        </Pressable>
      </View>

      {!plan ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>No plan yet</Text>
          <Text style={styles.emptyBody}>
            Generate a glucose-aware week. Uses your preferences and Lens learnings.
          </Text>
          <Pressable style={styles.primary} onPress={generate} disabled={genBusy}>
            <Text style={styles.primaryText}>{genBusy ? "Generating…" : "Generate weekly plan"}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {view === "week" ? (
            days.map((d, di) => (
              <View key={d.date} style={styles.dayCard}>
                <Text style={styles.dayTitle}>{d.date}</Text>
                {d.meals.map((m, mi) => (
                  <View key={`${m.slot}-${mi}`} style={styles.meal}>
                    <View style={styles.mealHead}>
                      <Text style={styles.slot}>{m.slot}</Text>
                      <Text style={styles.score}>{m.glucoseImpactScore}/10 stable</Text>
                    </View>
                    <Text style={styles.mealTitle}>{m.title}</Text>
                    <Text style={styles.meta}>{m.prepMinutes} min prep</Text>
                    <Pressable
                      style={styles.swapBtn}
                      onPress={() => setSwapTarget({ day: di, meal: mi, mealObj: m })}
                    >
                      <Text style={styles.swapText}>Swap</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ))
          ) : (
            <View style={styles.dayPicker}>
              {days.map((d, i) => (
                <Pressable
                  key={d.date}
                  style={[styles.dayChip, dayIndex === i && styles.dayChipOn]}
                  onPress={() => setDayIndex(i)}
                >
                  <Text style={[styles.dayChipText, dayIndex === i && styles.dayChipTextOn]}>
                    {d.date.slice(5)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          {view === "day" && todayBlock ? (
            <View style={styles.dayCard}>
              <Text style={styles.dayTitle}>{todayBlock.date}</Text>
              {todayBlock.meals.map((m, mi) => {
                const di = Math.min(dayIndex, days.length - 1);
                return (
                  <View key={`${m.slot}-${mi}`} style={styles.meal}>
                    <View style={styles.mealHead}>
                      <Text style={styles.slot}>{m.slot}</Text>
                      <Text style={styles.score}>{m.glucoseImpactScore}/10 stable</Text>
                    </View>
                    <Text style={styles.mealTitle}>{m.title}</Text>
                    <Text style={styles.meta}>{m.prepMinutes} min prep</Text>
                    <Text style={styles.ing}>
                      {(m.ingredients ?? []).slice(0, 8).join(" · ")}
                      {(m.ingredients?.length ?? 0) > 8 ? "…" : ""}
                    </Text>
                    <Pressable
                      style={styles.swapBtn}
                      onPress={() => setSwapTarget({ day: di, meal: mi, mealObj: m })}
                    >
                      <Text style={styles.swapText}>Swap</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal visible={!!swapTarget} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Swap meal</Text>
            <Text style={styles.modalSub}>Optional note for the model (dislikes, time, etc.)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. No dairy tonight"
              value={swapReason}
              onChangeText={setSwapReason}
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.secondary} onPress={() => setSwapTarget(null)}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.primary} onPress={runSwap} disabled={swapBusy}>
                <Text style={styles.primaryText}>{swapBusy ? "…" : "Get swap"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f2" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f6faf7",
    borderBottomWidth: 1,
    borderBottomColor: "#d9e8df",
  },
  toggle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#dfece5",
  },
  toggleOn: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#c5d6cc" },
  toggleText: { fontWeight: "600", color: "#4a6a5e" },
  toggleTextOn: { color: "#0d3d2c" },
  gen: {
    marginLeft: "auto",
    backgroundColor: "#1b7a5c",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  genText: { color: "#fff", fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 40, gap: 12 },
  emptyWrap: { padding: 24, gap: 12 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#0d3d2c" },
  emptyBody: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  primary: {
    backgroundColor: "#1b7a5c",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dayCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d9e8df",
    gap: 10,
  },
  dayTitle: { fontSize: 16, fontWeight: "800", color: "#0d3d2c" },
  meal: {
    borderTopWidth: 1,
    borderTopColor: "#edf3f0",
    paddingTop: 10,
    gap: 4,
  },
  mealHead: { flexDirection: "row", justifyContent: "space-between" },
  slot: { fontSize: 12, fontWeight: "700", color: "#1b7a5c", textTransform: "capitalize" },
  score: { fontSize: 12, color: "#5c6f66" },
  mealTitle: { fontSize: 17, fontWeight: "700", color: "#14261f" },
  meta: { fontSize: 13, color: "#5c6f66" },
  ing: { fontSize: 13, color: "#3d534a" },
  swapBtn: { alignSelf: "flex-start", marginTop: 6 },
  swapText: { color: "#1b7a5c", fontWeight: "700" },
  dayPicker: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  dayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#dfece5",
  },
  dayChipOn: { backgroundColor: "#1b7a5c" },
  dayChipText: { fontWeight: "600", color: "#2f4a3f" },
  dayChipTextOn: { color: "#fff" },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: "#0d3d2c" },
  modalSub: { fontSize: 14, color: "#4a5c54" },
  input: {
    borderWidth: 1,
    borderColor: "#c5d6cc",
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  modalRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 8 },
  secondary: { paddingVertical: 12, paddingHorizontal: 14 },
  secondaryText: { color: "#1b7a5c", fontWeight: "700" },
});
