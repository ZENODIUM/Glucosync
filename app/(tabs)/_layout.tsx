import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "../../lib/theme";

function BrandHeader() {
  return (
    <View style={styles.brandWrap}>
      <View style={styles.brandGlyph}>
        <Ionicons name="pulse" size={12} color={theme.colors.text} />
      </View>
      <Text style={styles.brandText}>GlucoSync</Text>
    </View>
  );
}

function MinimalTabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  function jumpTo(index: number) {
    const route = state.routes[index];
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) navigation.navigate(route.name);
  }

  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row}>
        <Pressable
          style={styles.sideTab}
          onPress={() => {
            void Haptics.selectionAsync();
            jumpTo(0);
          }}
        >
          <Ionicons name={activeName === "index" ? "grid" : "grid-outline"} size={20} color={theme.colors.text} />
          <Text style={styles.tabLabel}>Dashboard</Text>
        </Pressable>

        <Pressable
          style={styles.centerBtn}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/(tabs)/lens");
          }}
        >
          <Ionicons name="scan" size={24} color={theme.colors.text} />
          <Text style={styles.centerLabel}>Lens</Text>
        </Pressable>

        <Pressable
          style={styles.sideTab}
          onPress={() => {
            void Haptics.selectionAsync();
            jumpTo(1);
          }}
        >
          <Ionicons name={activeName === "cart" ? "cart" : "cart-outline"} size={20} color={theme.colors.text} />
          <Text style={styles.tabLabel}>Cart</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.bgPure },
        headerTintColor: theme.colors.text,
        headerTitle: () => <BrandHeader />,
        tabBarStyle: { display: "none" },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
      tabBar={(props) => <MinimalTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Dashboard" }} />
      <Tabs.Screen name="cart" options={{ title: "Cart" }} />
      <Tabs.Screen name="lens" options={{ title: "Lens", href: null }} />
      <Tabs.Screen name="agent" options={{ title: "Agent", href: null }} />
      <Tabs.Screen name="history" options={{ title: "History", href: null }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", href: null }} />
      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="status" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  brandWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  brandText: { fontSize: 17, fontWeight: "900", letterSpacing: -0.3, color: theme.colors.text },
  wrap: {
    backgroundColor: theme.colors.bgPure,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sideTab: { width: 92, alignItems: "center", justifyContent: "center", gap: 4 },
  tabLabel: { fontSize: 11, fontWeight: "700", color: theme.colors.textMuted },
  centerBtn: {
    marginTop: -22,
    width: 74,
    height: 74,
    borderRadius: 37,
    borderWidth: 1,
    borderColor: theme.colors.text,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  centerLabel: { fontSize: 10, fontWeight: "800", color: theme.colors.text },
});
