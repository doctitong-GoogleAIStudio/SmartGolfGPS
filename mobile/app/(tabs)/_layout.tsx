import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: "rgba(255,255,255,0.55)",
        tabBarStyle: {
          backgroundColor: colors.charcoal,
          borderTopColor: "rgba(255,255,255,0.1)",
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
      }}
    >
      <Tabs.Screen
        name="play"
        options={{ title: "MAP", tabBarIcon: ({ color, size }) => <Ionicons name="map" size={size} color={color} />, tabBarButtonTestID: "nav-map" }}
      />
      <Tabs.Screen
        name="score"
        options={{ title: "SCORE", tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />, tabBarButtonTestID: "nav-score" }}
      />
      <Tabs.Screen
        name="caddie"
        options={{ title: "CADDIE", tabBarIcon: ({ color, size }) => <Ionicons name="sparkles" size={size} color={color} />, tabBarButtonTestID: "nav-caddie" }}
      />
      <Tabs.Screen
        name="bag"
        options={{ title: "BAG", tabBarIcon: ({ color, size }) => <Ionicons name="briefcase" size={size} color={color} />, tabBarButtonTestID: "nav-bag" }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: "MORE", tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle" size={size} color={color} />, tabBarButtonTestID: "nav-more" }}
      />
    </Tabs>
  );
}
