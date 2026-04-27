import { Tabs } from "expo-router";
import { Text } from "react-native";

function TabLabel({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 11, fontWeight: focused ? "700" : "500", color: focused ? "#1b7a5c" : "#6b7f76" }}>
      {label}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#f6faf7" },
        headerTintColor: "#0d3d2c",
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: "#1b7a5c",
        tabBarInactiveTintColor: "#6b7f76",
        tabBarStyle: { backgroundColor: "#fff", borderTopColor: "#d9e8df" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: ({ focused }) => <TabLabel label="Home" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="lens"
        options={{
          title: "Lens",
          tabBarLabel: ({ focused }) => <TabLabel label="Lens" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarLabel: ({ focused }) => <TabLabel label="Plan" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="cart"
        options={{
          title: "Cart",
          tabBarLabel: ({ focused }) => <TabLabel label="Cart" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
