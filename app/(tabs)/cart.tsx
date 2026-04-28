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
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useIsFocused } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import type { MealPlanJson } from "../../lib/types";
import { buildSearchQuery, groupByAisle, retailerUrls } from "../../lib/cart";
import { theme } from "../../lib/theme";

export default function CartScreen() {
  const isFocused = useIsFocused();
  const [plan, setPlan] = useState<MealPlanJson | null>(null);
  const [mealFoods, setMealFoods] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, logs] = await Promise.all([
      supabase
        .from("meal_plans")
        .select("plan_json")
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("meal_logs")
        .select("parsed_json")
        .order("created_at", { ascending: false })
        .limit(60),
    ]);
    setPlan((p.data?.plan_json as MealPlanJson) ?? null);
    if (!logs.error) {
      const fromLogs = ((logs.data ?? []) as Array<{ parsed_json?: any }>)
        .flatMap((r) => (r.parsed_json?.foods ?? []) as Array<{ name?: string }>)
        .map((f) => (f.name ?? "").trim())
        .filter(Boolean);
      setMealFoods(fromLogs);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isFocused) void load();
  }, [isFocused, load]);

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
    return acc.concat(mealFoods);
  }, [plan, mealFoods]);

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

  async function copyList() {
    const lines: string[] = [];
    for (const a of aisles) {
      lines.push(`${a}:`);
      for (const it of grouped[a] ?? []) lines.push(`- ${it}`);
      lines.push("");
    }
    await Clipboard.setStringAsync(lines.join("\n"));
    Alert.alert("Copied", "Grocery list copied to clipboard.");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Cart</Text>
      <Text style={styles.lead}>Merged ingredients with one-tap export and retailer links.</Text>

      <View style={styles.actionRow}>
        <Pressable style={styles.primary} onPress={copyShare}>
          <Ionicons name="share-outline" size={16} color={theme.colors.text} />
          <Text style={styles.primaryText}>Share list</Text>
        </Pressable>
        <Pressable style={styles.secondaryAction} onPress={() => void copyList()}>
          <Ionicons name="copy-outline" size={16} color={theme.colors.text} />
          <Text style={styles.primaryText}>Copy list</Text>
        </Pressable>
      </View>

      {!plan ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No plan yet</Text>
          <Text style={styles.emptyBody}>Generate a plan first to create your grocery stack.</Text>
        </View>
      ) : (
        <>
          <Text style={styles.section}>Aisles</Text>
          {aisles.map((a) => (
            <View key={a} style={styles.block}>
              <Text style={styles.blockTitle}>{a}</Text>
              {(grouped[a] ?? []).map((it) => (
                <Text key={it} style={styles.item}>• {it}</Text>
              ))}
            </View>
          ))}

          <Text style={styles.section}>Retailers</Text>
          {retailers.map((r) => (
            <Pressable key={r.label} style={styles.retailer} onPress={() => void WebBrowser.openBrowserAsync(r.url)}>
              <Text style={styles.retailerText}>{r.label}</Text>
            </Pressable>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  content: { padding: 18, paddingBottom: 120, gap: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  h1: { fontSize: 32, fontWeight: "900", letterSpacing: -1, color: theme.colors.text },
  lead: { fontSize: 14, color: theme.colors.textMuted },
  actionRow: { flexDirection: "row", gap: 8 },
  primary: {
    flex: 1,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: theme.colors.text,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  secondaryAction: {
    flex: 1,
    backgroundColor: theme.colors.bgPure,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  primaryText: { fontWeight: "800", color: theme.colors.text },
  section: { fontSize: 12, fontWeight: "800", textTransform: "uppercase", color: theme.colors.textMuted, marginTop: 6 },
  block: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.bgPure, padding: 12, gap: 6 },
  blockTitle: { fontSize: 13, fontWeight: "800", color: theme.colors.text },
  item: { color: theme.colors.textMuted, fontSize: 14 },
  retailer: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.bgPure, paddingVertical: 12, paddingHorizontal: 12 },
  retailerText: { color: theme.colors.text, fontWeight: "700" },
  emptyCard: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 8, backgroundColor: theme.colors.bgPure, padding: 12, gap: 6 },
  emptyTitle: { fontSize: 18, fontWeight: "800", color: theme.colors.text },
  emptyBody: { color: theme.colors.textMuted },
});
