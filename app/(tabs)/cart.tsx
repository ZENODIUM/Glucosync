import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { supabase } from "../../lib/supabase";
import type { MealPlanJson } from "../../lib/types";
import { buildSearchQuery, groupByAisle, retailerUrls } from "../../lib/cart";

export default function CartScreen() {
  const [plan, setPlan] = useState<MealPlanJson | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("meal_plans")
      .select("plan_json")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();
    setPlan((data?.plan_json as MealPlanJson) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    if (!plan?.days) return [];
    const acc: string[] = [];
    for (const d of plan.days) {
      for (const m of d.meals ?? []) {
        for (const ing of m.ingredients ?? []) {
          if (ing?.trim()) acc.push(ing.trim());
        }
      }
    }
    return acc;
  }, [plan]);

  const grouped = useMemo(() => groupByAisle(items), [items]);
  const aisles = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const query = useMemo(() => buildSearchQuery(items), [items]);
  const retailers = useMemo(() => retailerUrls(query), [query]);

  async function copyShare() {
    const lines: string[] = ["GlucoSync grocery list", ""];
    for (const a of aisles) {
      lines.push(`## ${a}`);
      for (const it of grouped[a] ?? []) lines.push(`- ${it}`);
      lines.push("");
    }
    const message = lines.join("\n");
    try {
      await Share.share({ message, title: "GlucoSync list" });
    } catch {
      Alert.alert("Share", "Sharing is not available on this device.");
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1b7a5c" />
      </View>
    );
  }

  if (!plan) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No groceries yet</Text>
        <Text style={styles.emptyBody}>Generate a meal plan first, then your list appears here.</Text>
        <Pressable style={styles.primary} onPress={() => router.push("/(tabs)/plan")}>
          <Text style={styles.primaryText}>Open Plan tab</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Smart cart</Text>
      <Text style={styles.lead}>
        Consolidated from your latest plan. Retailer buttons open a single search for the
        whole list (not one tab per ingredient).
      </Text>

      <Pressable style={styles.primary} onPress={copyShare}>
        <Text style={styles.primaryText}>Copy / share list</Text>
      </Pressable>

      <Text style={styles.section}>By aisle (heuristic)</Text>
      {aisles.map((a) => (
        <View key={a} style={styles.aisle}>
          <Text style={styles.aisleTitle}>{a}</Text>
          {(grouped[a] ?? []).map((it) => (
            <Text key={it} style={styles.item}>
              • {it}
            </Text>
          ))}
        </View>
      ))}

      <Text style={styles.section}>Retailers</Text>
      {retailers.map((r) => (
        <Pressable
          key={r.label}
          style={styles.retailer}
          onPress={() => {
            void WebBrowser.openBrowserAsync(r.url);
          }}
        >
          <Text style={styles.retailerText}>{r.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#eef6f2" },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 26, fontWeight: "700", color: "#0d3d2c" },
  lead: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
  primary: {
    backgroundColor: "#1b7a5c",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  section: { fontSize: 17, fontWeight: "700", color: "#0d3d2c", marginTop: 8 },
  aisle: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d9e8df",
    gap: 6,
  },
  aisleTitle: { fontSize: 15, fontWeight: "800", color: "#1b7a5c" },
  item: { fontSize: 15, color: "#24342d" },
  retailer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#c5d6cc",
  },
  retailerText: { fontSize: 16, fontWeight: "700", color: "#0d3d2c" },
  emptyWrap: { flex: 1, padding: 24, justifyContent: "center", gap: 10 },
  emptyTitle: { fontSize: 22, fontWeight: "700", color: "#0d3d2c" },
  emptyBody: { fontSize: 15, color: "#3d534a", lineHeight: 22 },
});
