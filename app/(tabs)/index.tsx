import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, ToastAndroid, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { supabase } from "../../lib/supabase";
import { theme } from "../../lib/theme";
import type { GlucoseReading, MealPlanRow } from "../../lib/types";

export default function DashboardScreen() {
  const isFocused = useIsFocused();
  const router = useRouter();
  const [glucose, setGlucose] = useState<GlucoseReading[]>([]);
  const [todayMealCount, setTodayMealCount] = useState(0);
  const [nextMeal, setNextMeal] = useState<string>("Build plan");
  const [glp1Mode, setGlp1Mode] = useState(false);
  const [glpBusy, setGlpBusy] = useState(false);
  const [timingInsight, setTimingInsight] = useState("No timing pattern yet.");
  const [weekPattern, setWeekPattern] = useState("Keep logging meals to unlock weekly coaching memory.");
  const [proteinAlert, setProteinAlert] = useState<string | null>(null);

  async function load() {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())
      .toISOString()
      .slice(0, 10);

    const [g, m, p, profile, meals, recentGlucose] = await Promise.all([
      supabase.from("glucose_readings").select("id,ts,mg_dl,source").order("ts", { ascending: false }).limit(16),
      supabase.from("meal_logs").select("id").gte("created_at", dayStart),
      supabase.from("meal_plans").select("id,week_start,plan_json").eq("week_start", weekStart).maybeSingle(),
      supabase.from("profiles").select("glp1_mode").maybeSingle(),
      supabase
        .from("meal_logs")
        .select("created_at,parsed_json")
        .order("created_at", { ascending: false })
        .limit(120),
      supabase
        .from("glucose_readings")
        .select("mg_dl,ts")
        .order("ts", { ascending: false })
        .limit(240),
    ]);
    if (!g.error) setGlucose((g.data ?? []) as GlucoseReading[]);
    if (!m.error) setTodayMealCount((m.data ?? []).length);
    if (!profile.error) setGlp1Mode(Boolean((profile.data as any)?.glp1_mode));
    if (!meals.error) {
      const rows = (meals.data ?? []) as Array<{ created_at: string; parsed_json?: any }>;
      const weekdayCounts = Array.from({ length: 7 }, () => 0);
      rows.forEach((r) => {
        const wd = new Date(r.created_at).getDay();
        weekdayCounts[wd] += 1;
      });
      const friday = weekdayCounts[5];
      const avgOthers = weekdayCounts.filter((_, i) => i !== 5).reduce((a, b) => a + b, 0) / 6;
      if (friday > 0 && friday < avgOthers * 0.65) {
        setWeekPattern("Pattern memory: every Friday you deviate from your plan. Pre-plan a flexible Friday dinner swap.");
      } else {
        setWeekPattern("Pattern memory: this week looks stable. Keep the same meal timing windows.");
      }

      const latestProtein = Number(rows[0]?.parsed_json?.macros?.proteinG ?? 0);
      const profileGlp = Boolean((profile.data as any)?.glp1_mode);
      if (profileGlp && latestProtein > 0 && latestProtein < 25) {
        setProteinAlert(
          "Low protein detected. GLP-1 users need 30g+ per meal to prevent muscle loss. Swap suggestion: add Greek yogurt or chicken.",
        );
      } else {
        setProteinAlert(null);
      }
    }
    if (!recentGlucose.error) {
      const rows = (recentGlucose.data ?? []) as Array<{ mg_dl: number; ts: string }>;
      const hourBuckets: Record<number, number[]> = {};
      rows.forEach((r) => {
        const h = new Date(r.ts).getHours();
        if (!hourBuckets[h]) hourBuckets[h] = [];
        hourBuckets[h].push(r.mg_dl);
      });
      let bestHour = -1;
      let bestAvg = -Infinity;
      Object.entries(hourBuckets).forEach(([h, vals]) => {
        const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
        if (avg > bestAvg) {
          bestAvg = avg;
          bestHour = Number(h);
        }
      });
      if (bestHour >= 0) {
        const end = (bestHour + 2) % 24;
        setTimingInsight(
          `Meal timing intelligence: your highest spike window is around ${String(bestHour).padStart(2, "0")}:00-${String(end).padStart(2, "0")}:00. Plan lower-glycemic meals here.`,
        );
      }
    }
    if (!p.error && p.data) {
      const plan = p.data as MealPlanRow;
      const day = plan.plan_json?.days?.find((d) => d.date === new Date().toISOString().slice(0, 10)) ?? plan.plan_json?.days?.[0];
      setNextMeal(day?.meals?.[0]?.title ?? "Generate today's meals");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    void load();
    const id = setInterval(() => {
      void load();
    }, 12000);
    return () => clearInterval(id);
  }, [isFocused]);

  const level = glucose[0]?.mg_dl ?? 0;
  const prev = glucose[1]?.mg_dl ?? level;
  const delta = level - prev;
  const progress = Math.min(Math.max((level - 70) / 110, 0), 1);
  const trend = useMemo(() => glucose.slice(0, 12).reverse().map((r) => r.mg_dl), [glucose]);

  async function toggleGlp1() {
    if (glpBusy) return;
    setGlpBusy(true);
    const next = !glp1Mode;
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setGlpBusy(false);
      return;
    }
    const { error } = await supabase.from("profiles").update({ glp1_mode: next }).eq("id", uid);
    setGlpBusy(false);
    if (error) {
      Alert.alert("GLP-1 mode", error.message);
      return;
    }
    setGlp1Mode(next);
    const msg = next
      ? "Protein targets maximized to prevent muscle loss. Portion sizes reduced."
      : "GLP-1 mode off. Balanced metabolic targets restored.";
    if (Platform.OS === "android") ToastAndroid.show(msg, ToastAndroid.LONG);
    else Alert.alert("GLP-1 Mode", msg);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.h1}>Dashboard</Text>
        <Pressable
          style={styles.avatarBtn}
          onPress={() => {
            void Haptics.selectionAsync();
            router.push("/(tabs)/settings");
          }}
        >
          <Ionicons name="person-outline" size={18} color={theme.colors.text} />
        </Pressable>
      </View>

      <Text style={styles.sub}>METABOLIC STATUS + PLAN EXECUTION</Text>

      <View style={styles.panel}>
        <View style={styles.panelHeading}>
          <Ionicons name="pulse-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.panelTitle}>Current Glucose</Text>
        </View>
        <View style={styles.glucoseRow}>
          <Text style={styles.glucoseValue}>{level}</Text>
          <Text style={styles.glucoseUnit}>mg/dL</Text>
          <Text style={[styles.delta, { color: delta > 0 ? theme.colors.accent : theme.colors.text }]}>
            {delta >= 0 ? "+" : ""}
            {delta}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.deltaHint}>
          Change vs previous reading: {delta >= 0 ? "+" : ""}
          {delta} mg/dL
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={styles.tile}>
          <Text style={styles.tileLabel}>Today Plan</Text>
          <Text style={styles.tileHead}>{todayMealCount} meals logged</Text>
          <Text style={styles.tileBody}>Keep consistency for lower spikes through the day.</Text>
        </View>
        <View style={styles.tile}>
          <View style={styles.glpRow}>
            <Text style={styles.tileLabel}>GLP-1 Mode</Text>
            <Pressable style={[styles.glpBtn, glp1Mode && styles.glpBtnOn]} onPress={toggleGlp1} disabled={glpBusy}>
              <Text style={styles.glpText}>{glpBusy ? "..." : glp1Mode ? "ON" : "OFF"}</Text>
            </Pressable>
          </View>
          <Text style={styles.tileHead}>Plan focus</Text>
          <Text style={styles.tileBody}>{nextMeal}</Text>
        </View>
      </View>

      <View style={styles.planPanel}>
        <View style={styles.panelHeading}>
          <Ionicons name="analytics-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.panelTitle}>Micro Trend</Text>
        </View>
        <View style={styles.sparkWrap}>
          {trend.map((v, i) => (
            <View key={`${v}-${i}`} style={[styles.sparkBar, { height: 10 + Math.max(v - 70, 0) * 0.6 }]} />
          ))}
        </View>
        <Pressable
          style={styles.linkBtn}
          onPress={() => {
            void Haptics.selectionAsync();
            router.push("/(tabs)/history");
          }}
        >
          <Text style={styles.linkText}>Open full history + graphs</Text>
        </Pressable>
      </View>

      <View style={styles.planPanel}>
        <View style={styles.panelHeading}>
          <Ionicons name="restaurant-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.panelTitle}>Adaptive Plan Snapshot</Text>
        </View>
        <View style={styles.rowLine}><Text style={styles.mono}>08:00</Text><Text style={styles.lineText}>Greek yogurt, chia, berries</Text></View>
        <View style={styles.rowLine}><Text style={styles.mono}>12:30</Text><Text style={styles.lineText}>Chicken quinoa bowl</Text></View>
        <View style={styles.rowLine}><Text style={styles.mono}>16:30</Text><Text style={styles.lineText}>Almond snack</Text></View>
        <View style={styles.rowLine}><Text style={styles.mono}>19:30</Text><Text style={styles.lineText}>Salmon + greens</Text></View>
      </View>

      <View style={styles.planPanel}>
        <View style={styles.panelHeading}>
          <Ionicons name="time-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.panelTitle}>Timing Intelligence</Text>
        </View>
        <Text style={styles.lineText}>{timingInsight}</Text>
      </View>

      <View style={styles.planPanel}>
        <View style={styles.panelHeading}>
          <Ionicons name="repeat-outline" size={14} color={theme.colors.textMuted} />
          <Text style={styles.panelTitle}>Pattern Memory</Text>
        </View>
        <Text style={styles.lineText}>{weekPattern}</Text>
      </View>

      {proteinAlert ? (
        <View style={[styles.planPanel, { borderColor: theme.colors.text }]}>
          <Text style={styles.panelTitle}>GLP-1 Alert</Text>
          <Text style={styles.lineText}>⚠️ {proteinAlert}</Text>
        </View>
      ) : null}

      <Pressable
        style={styles.voiceAgentBtn}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push("/(tabs)/agent");
        }}
      >
        <Text style={styles.voiceAgentText}>Open Voice Agent</Text>
      </Pressable>

      <View style={styles.quickRow}>
        <Pressable style={styles.quickBtn} onPress={() => router.push("/(tabs)/plan")}>
          <Ionicons name="calendar-outline" size={16} color={theme.colors.text} />
          <Text style={styles.quickText}>Open Plan</Text>
        </Pressable>
        <Pressable style={styles.quickBtn} onPress={() => router.push("/(tabs)/history")}>
          <Ionicons name="bar-chart-outline" size={16} color={theme.colors.text} />
          <Text style={styles.quickText}>Open History</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 18, paddingBottom: 120, gap: 14 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h1: { fontSize: 32, fontWeight: "900", letterSpacing: -1, color: theme.colors.text },
  avatarBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgPure,
    alignItems: "center",
    justifyContent: "center",
  },
  sub: { fontSize: 11, fontWeight: "800", letterSpacing: 1.2, color: theme.colors.textMuted },
  panel: {
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  panelTitle: { fontSize: 13, fontWeight: "800", color: theme.colors.textMuted, textTransform: "uppercase" },
  panelHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  glucoseRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  glucoseValue: { fontFamily: "monospace", fontSize: 42, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.5 },
  glucoseUnit: { fontFamily: "monospace", fontSize: 14, marginBottom: 8, color: theme.colors.textMuted },
  delta: { fontFamily: "monospace", fontSize: 20, marginLeft: "auto", marginBottom: 7, fontWeight: "800" },
  progressTrack: { height: 8, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 4 },
  progressFill: { height: "100%", backgroundColor: theme.colors.accent },
  deltaHint: { fontSize: 12, color: theme.colors.textMuted, fontFamily: "monospace" },
  grid: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    gap: 6,
  },
  tileLabel: { fontSize: 11, fontWeight: "800", textTransform: "uppercase", color: theme.colors.textMuted },
  tileHead: { fontSize: 18, fontWeight: "800", color: theme.colors.text, letterSpacing: -0.4 },
  tileBody: { fontSize: 13, color: theme.colors.textMuted, lineHeight: 18 },
  glpRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  glpBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.colors.bgPure,
  },
  glpBtnOn: { borderColor: theme.colors.text, backgroundColor: theme.colors.accent },
  glpText: { fontSize: 11, fontWeight: "900", color: theme.colors.text, fontFamily: "monospace" },
  planPanel: {
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 14,
    gap: 8,
  },
  rowLine: { flexDirection: "row", gap: 12, alignItems: "center" },
  mono: { fontFamily: "monospace", fontSize: 14, width: 52, color: theme.colors.text },
  lineText: { fontSize: 14, color: theme.colors.textMuted, fontWeight: "600" },
  sparkWrap: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    minHeight: 76,
    padding: 8,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  sparkBar: { width: 10, borderRadius: 2, backgroundColor: theme.colors.accent },
  linkBtn: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: "center",
  },
  linkText: { fontSize: 13, fontWeight: "700", color: theme.colors.text },
  voiceAgentBtn: {
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.text,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  voiceAgentText: { color: theme.colors.text, fontWeight: "800" },
  quickRow: { flexDirection: "row", gap: 10 },
  quickBtn: {
    flex: 1,
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  quickText: { color: theme.colors.text, fontWeight: "800" },
});
