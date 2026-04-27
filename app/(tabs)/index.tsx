import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import type { GlucoseReading, MetabolicInsight } from "../../lib/types";

export default function HomeScreen() {
  const [readings, setReadings] = useState<GlucoseReading[]>([]);
  const [insights, setInsights] = useState<MetabolicInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: g }, { data: i }] = await Promise.all([
      supabase
        .from("glucose_readings")
        .select("id,ts,mg_dl,source")
        .order("ts", { ascending: true })
        .limit(120),
      supabase
        .from("metabolic_insights")
        .select("id,body,created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    setReadings((g ?? []) as GlucoseReading[]);
    setInsights((i ?? []) as MetabolicInsight[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latest = readings[readings.length - 1]?.mg_dl;
  const stability = useMemo(() => {
    if (readings.length < 3) return { label: "Calibrating", tone: "#7a8a82" };
    const slice = readings.slice(-18);
    const values = slice.map((r) => r.mg_dl);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    if (sd < 8) return { label: "Stable", tone: "#1b7a5c" };
    if (sd < 14) return { label: "Mostly steady", tone: "#b88900" };
    return { label: "Variable", tone: "#c45c3a" };
  }, [readings]);

  const nextAction = useMemo(() => {
    if (latest == null) return "Log a meal in Lens so we can personalize your next steps.";
    if (latest < 75) {
      return "Glucose is on the lower side. Time for a balanced snack with protein.";
    }
    if (latest > 160) {
      return "Levels are elevated. Focus on protein and fiber at your next meal.";
    }
    return "You are in a steady band. Keep following your plan and hydrate.";
  }, [latest]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1b7a5c" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor="#1b7a5c"
        />
      }
    >
      <Text style={styles.h1}>Metabolic status</Text>
      <Text style={styles.lead}>Calm guidance based on your mock CGM curve (MVP).</Text>

      <View style={styles.ringCard}>
        <View style={[styles.ring, { borderColor: stability.tone }]}>
          <Text style={[styles.ringValue, { color: stability.tone }]}>
            {latest != null ? `${latest}` : "—"}
          </Text>
          <Text style={styles.ringUnit}>mg/dL (latest)</Text>
        </View>
        <View style={styles.ringMeta}>
          <Text style={styles.ringLabel}>{stability.label}</Text>
          <Text style={styles.ringHint}>Mock data for demonstration.</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Next action</Text>
        <Text style={styles.cardBody}>{nextAction}</Text>
      </View>

      <Text style={styles.section}>Quick insights</Text>
      {insights.length === 0 ? (
        <Text style={styles.empty}>Insights appear after you log meals with Lens.</Text>
      ) : (
        insights.map((row) => (
          <View key={row.id} style={styles.insight}>
            <Text style={styles.insightText}>{row.body}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f2" },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 26, fontWeight: "700", color: "#0d3d2c" },
  lead: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  ringCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d9e8df",
  },
  ring: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f6faf7",
  },
  ringValue: { fontSize: 28, fontWeight: "800" },
  ringUnit: { fontSize: 11, color: "#5c6f66" },
  ringMeta: { flex: 1, gap: 6 },
  ringLabel: { fontSize: 18, fontWeight: "700", color: "#0d3d2c" },
  ringHint: { fontSize: 13, color: "#5c6f66" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d9e8df",
    gap: 8,
  },
  cardKicker: { fontSize: 13, fontWeight: "700", color: "#1b7a5c", textTransform: "uppercase" },
  cardBody: { fontSize: 16, color: "#1f332b", lineHeight: 24 },
  section: { fontSize: 18, fontWeight: "700", color: "#0d3d2c", marginTop: 8 },
  empty: { fontSize: 15, color: "#5c6f66" },
  insight: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d9e8df",
  },
  insightText: { fontSize: 15, color: "#24342d", lineHeight: 22 },
});
