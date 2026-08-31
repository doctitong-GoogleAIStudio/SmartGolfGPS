import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { subscribeToasts, ToastItem } from "@/src/lib/toast";

export function ToastHost() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts((t) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), 3200);
    });
  }, []);

  if (!items.length) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + 8 }]}>
      {items.map((t) => (
        <Row key={t.id} item={t} />
      ))}
    </View>
  );
}

function Row({ item }: { item: ToastItem }) {
  const a = React.useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 16, stiffness: 220 }).start();
  }, [a]);
  const bg = item.kind === "success" ? colors.green : item.kind === "error" ? colors.red : colors.charcoal;
  return (
    <Animated.View
      testID="toast"
      style={[
        styles.toast,
        { backgroundColor: bg, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] },
      ]}
    >
      <Text style={styles.text}>{item.text}</Text>
      {item.desc ? <Text style={styles.desc}>{item.desc}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 9999 },
  toast: {
    maxWidth: "92%",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: "#fff", fontWeight: "800", fontSize: 13, textAlign: "center" },
  desc: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2, textAlign: "center" },
});
