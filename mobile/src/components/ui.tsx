import React from "react";
import { View, Text, StyleSheet, Pressable, TextProps, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";

export function Overline({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[styles.overline, style]}>{children}</Text>;
}

export function NumText({ children, style, ...p }: TextProps & { children: React.ReactNode }) {
  return (
    <Text {...p} style={[{ fontFamily: font.num }, style]}>
      {children}
    </Text>
  );
}

export function HeadText({ children, style, ...p }: TextProps & { children: React.ReactNode }) {
  return (
    <Text {...p} style={[{ fontFamily: font.headBold, fontWeight: "800", color: colors.charcoal }, style]}>
      {children}
    </Text>
  );
}

// Dark header bar used across most stacked screens.
export function ScreenHeader({
  overline,
  title,
  onBack,
  onHome,
  right,
  testID,
}: {
  overline: string;
  title: string;
  onBack?: () => void;
  onHome?: () => void;
  right?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.header} testID={testID}>
      {onBack && (
        <Pressable testID="header-back-btn" onPress={onBack} style={styles.headerIcon}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Overline style={{ color: colors.gold }}>{overline}</Overline>
        <HeadText style={styles.headerTitle}>{title}</HeadText>
      </View>
      {right}
      {onHome && (
        <Pressable testID="header-home-btn" onPress={onHome} style={styles.headerIcon}>
          <Ionicons name="home" size={18} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function StatBox({ label, value, testID }: { label: string; value: React.ReactNode; testID?: string }) {
  return (
    <View style={styles.statBox} testID={testID}>
      <Text style={styles.statLabel}>{label}</Text>
      <NumText style={styles.statValue}>{value}</NumText>
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
  desc,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  desc?: string;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} onPress={() => onChange(!value)} style={styles.rowCard}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {desc ? <Text style={styles.rowDesc}>{desc}</Text> : null}
      </View>
      <View style={[styles.track, { backgroundColor: value ? colors.green : colors.zinc300 }]}>
        <View style={[styles.knob, value && { transform: [{ translateX: 20 }] }]} />
      </View>
    </Pressable>
  );
}

export function Segment({
  label,
  options,
  value,
  onChange,
  testID,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
  testID: string;
}) {
  return (
    <View style={[styles.rowCard, { paddingVertical: 12 }]}>
      <Text style={[styles.rowLabel, { flex: 1 }]}>{label}</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {options.map(([v, l]) => (
          <Pressable
            key={v}
            testID={`${testID}-${v}`}
            onPress={() => onChange(v)}
            style={[styles.segBtn, value === v ? { backgroundColor: colors.green } : { backgroundColor: colors.zinc100 }]}
          >
            <Text style={[styles.segTxt, { color: value === v ? "#fff" : colors.zinc500 }]}>{l}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overline: { fontSize: 11, letterSpacing: 2, fontWeight: "800", textTransform: "uppercase", color: colors.zinc400 },
  header: {
    backgroundColor: colors.charcoal,
    paddingHorizontal: 20,
    paddingBottom: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: { color: "#fff", fontSize: 24, marginTop: 2 },
  headerIcon: { height: 40, width: 40, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 20, padding: 16 },
  statBox: { flex: 1, backgroundColor: "#fff", borderWidth: 1, borderColor: colors.zinc200, borderRadius: 16, paddingVertical: 12, alignItems: "center" },
  statLabel: { fontSize: 8, letterSpacing: 1.5, fontWeight: "800", color: colors.zinc400 },
  statValue: { fontSize: 26, color: colors.charcoal, marginTop: 2 },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.zinc200,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { fontWeight: "700", fontSize: 14, color: colors.charcoal },
  rowDesc: { fontSize: 10, color: colors.zinc400, fontWeight: "600", marginTop: 2 },
  track: { width: 48, height: 28, borderRadius: 14, padding: 4, justifyContent: "center" },
  knob: { height: 20, width: 20, borderRadius: 10, backgroundColor: "#fff" },
  segBtn: { paddingHorizontal: 12, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  segTxt: { fontSize: 12, fontWeight: "800" },
});
