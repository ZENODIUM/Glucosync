import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function icon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons
      name={focused ? name : `${name}-outline` as keyof typeof Ionicons.glyphMap}
      color={color}
      size={size}
    />
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#f6faf7" },
        headerTintColor: "#0d3d2c",
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: "#1b7a5c",
        tabBarInactiveTintColor: "#6b7f76",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: "#d9e8df",
          borderTopWidth: 1,
          height: 52 + bottomPad,
          paddingTop: 6,
          paddingBottom: bottomPad,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Agent",
          tabBarIcon: icon("radio"),
        }}
      />
      <Tabs.Screen
        name="status"
        options={{
          title: "Status",
          tabBarIcon: icon("pulse"),
        }}
      />
      <Tabs.Screen
        name="lens"
        options={{
          title: "Lens",
          tabBarIcon: icon("camera"),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: icon("calendar"),
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarIcon: icon("cart"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: icon("settings"),
        }}
      />
    </Tabs>
  );
}
