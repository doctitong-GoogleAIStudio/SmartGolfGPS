import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ScrollView, Image, Linking, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as MailComposer from "expo-mail-composer";
import * as Clipboard from "expo-clipboard";
import { Ionicons } from "@expo/vector-icons";
import { colors, font } from "@/src/theme";
import { useLicense } from "@/src/context/LicenseContext";
import { OWNER_EMAIL } from "@/src/lib/license";
import { toast } from "@/src/lib/toast";

function fmtCountdown(ms: number) {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { d, h, m, s };
}

export function ActivationView({ onClose }: { onClose?: () => void }) {
  const insets = useSafeAreaInsets();
  const { deviceId, remainingMs, trialExpired, activate } = useLicense();
  const [ref, setRef] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const c = fmtCountdown(remainingMs);

  const copyId = async () => {
    await Clipboard.setStringAsync(deviceId);
    toast.success("Device ID copied");
  };

  const emailOwner = async () => {
    const subject = "Smart Golf GPS — Device Activation Request";
    const body = `Please activate my device.\n\nDevice ID: ${deviceId}\nGCash Reference No.: ${ref || "(enter your GCash reference number)"}\n\nThank you.`;
    try {
      const available = await MailComposer.isAvailableAsync();
      if (available) {
        await MailComposer.composeAsync({ recipients: [OWNER_EMAIL], subject, body });
      } else {
        const url = `mailto:${OWNER_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        await Linking.openURL(url);
      }
    } catch {
      toast.error("Could not open email app");
    }
  };

  const onActivate = async () => {
    if (!code.trim()) {
      toast.error("Enter your activation code");
      return;
    }
    setBusy(true);
    const ok = await activate(code.trim());
    setBusy(false);
    if (ok) toast.success("Device activated. Thank you!");
    else toast.error("Invalid activation code for this device");
  };

  return (
    <View style={[styles.fill, { paddingTop: insets.top }]} testID="activation-screen">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.badge}>
          <Ionicons name="golf" size={18} color={colors.gold} />
          <Text style={styles.badgeTxt}>SMART GOLF GPS</Text>
        </View>

        <Text style={[styles.title, { fontFamily: font.headBold }]}>
          {trialExpired ? "Activate this Device" : "Free Trial"}
        </Text>
        <Text style={styles.sub}>
          {trialExpired
            ? "Your 7-day free trial has ended. Activate this device to keep playing."
            : "You're on a 7-day free trial with full access."}
        </Text>

        {/* Countdown */}
        {!trialExpired && (
          <View style={styles.countRow} testID="trial-countdown">
            {[
              [c.d, "DAYS"],
              [c.h, "HRS"],
              [c.m, "MIN"],
              [c.s, "SEC"],
            ].map(([v, l]) => (
              <View key={l as string} style={styles.countBox}>
                <Text style={[styles.countNum, { fontFamily: font.num }]}>{String(v).padStart(2, "0")}</Text>
                <Text style={styles.countLbl}>{l}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Device ID */}
        <Text style={styles.section}>YOUR DEVICE ID</Text>
        <Pressable style={styles.idBox} onPress={copyId} testID="device-id-box">
          <Text style={[styles.idTxt, { fontFamily: font.num }]}>{deviceId || "…"}</Text>
          <Ionicons name="copy-outline" size={18} color={colors.zinc400} />
        </Pressable>

        {/* Payment */}
        <Text style={styles.section}>HOW TO ACTIVATE</Text>
        <View style={styles.stepsCard}>
          <Step n="1" t="Pay the activation fee via GCash using the QR code below." />
          <Step n="2" t="Enter your GCash reference number, then tap Email Device ID." />
          <Step n="3" t="We'll reply with your activation code — enter it below to unlock." />
        </View>

        <View style={styles.qrWrap} testID="gcash-qr">
          <GCashQR />
          <Text style={styles.qrHint}>Scan with your GCash app to pay ₱1,500</Text>
        </View>

        <Text style={styles.section}>GCASH REFERENCE NUMBER</Text>
        <TextInput
          testID="gcash-ref-input"
          value={ref}
          onChangeText={setRef}
          placeholder="e.g. 1234 567 890123"
          placeholderTextColor={colors.zinc400}
          style={styles.input}
          keyboardType="number-pad"
        />

        <Pressable style={styles.emailBtn} onPress={emailOwner} testID="email-device-btn">
          <Ionicons name="mail" size={18} color="#fff" />
          <Text style={styles.emailBtnTxt}>EMAIL DEVICE ID TO ACTIVATE</Text>
        </Pressable>

        {/* Enter code */}
        <Text style={styles.section}>ENTER ACTIVATION CODE</Text>
        <TextInput
          testID="activation-code-input"
          value={code}
          onChangeText={setCode}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          placeholderTextColor={colors.zinc400}
          autoCapitalize="characters"
          autoCorrect={false}
          style={[styles.input, { fontFamily: font.num, letterSpacing: 2 }]}
        />
        <Pressable style={[styles.activateBtn, busy && { opacity: 0.6 }]} onPress={onActivate} disabled={busy} testID="activate-btn">
          <Text style={styles.activateBtnTxt}>{busy ? "CHECKING…" : "ACTIVATE THIS DEVICE"}</Text>
        </Pressable>

        {!trialExpired && onClose && (
          <Pressable style={styles.later} onPress={onClose} testID="activate-later-btn">
            <Text style={styles.laterTxt}>Continue trial</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

function Step({ n, t }: { n: string; t: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumTxt}>{n}</Text>
      </View>
      <Text style={styles.stepTxt}>{t}</Text>
    </View>
  );
}

// GCash QR: renders the uploaded asset when present, else a labelled placeholder.
function GCashQR() {
  const [failed, setFailed] = useState(false);
  let source: any = null;
  try {
    // Owner uploads /app/mobile/assets/images/gcash-qr.png
    source = require("@/assets/images/gcash-pay4.png");
  } catch {
    source = null;
  }
  if (source && !failed) {
    return <Image source={source} style={styles.qr} onError={() => setFailed(true)} resizeMode="contain" />;
  }
  return (
    <View style={[styles.qr, styles.qrPlaceholder]}>
      <Ionicons name="qr-code-outline" size={56} color={colors.zinc400} />
      <Text style={styles.qrPlaceholderTxt}>GCash QR</Text>
      <Text style={styles.qrPlaceholderSub}>Add gcash-qr.png</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.charcoal },
  badge: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", marginBottom: 16 },
  badgeTxt: { color: colors.gold, fontSize: 12, fontWeight: "800", letterSpacing: 2 },
  title: { color: "#fff", fontSize: 34, fontWeight: "800" },
  sub: { color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 6, lineHeight: 20 },
  countRow: { flexDirection: "row", gap: 8, marginTop: 18 },
  countBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "rgba(212,175,55,0.4)" },
  countNum: { color: "#fff", fontSize: 30 },
  countLbl: { color: colors.gold, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginTop: 2 },
  section: { color: "rgba(255,255,255,0.5)", fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: 24, marginBottom: 8 },
  idBox: { backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  idTxt: { color: "#fff", fontSize: 22, letterSpacing: 3 },
  stepsCard: { backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 16, padding: 14, gap: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: { height: 26, width: 26, borderRadius: 13, backgroundColor: colors.green, alignItems: "center", justifyContent: "center" },
  stepNumTxt: { color: "#fff", fontWeight: "900", fontSize: 13 },
  stepTxt: { color: "rgba(255,255,255,0.85)", fontSize: 13, flex: 1, lineHeight: 18 },
  qrWrap: { alignItems: "center", marginTop: 16 },
  qr: { width: 260, height: 264, borderRadius: 16, backgroundColor: "#fff" },
  qrPlaceholder: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.zinc300, borderStyle: "dashed" },
  qrPlaceholderTxt: { color: colors.zinc500, fontWeight: "800", marginTop: 8 },
  qrPlaceholderSub: { color: colors.zinc400, fontSize: 11, marginTop: 2 },
  qrHint: { color: "rgba(255,255,255,0.6)", fontSize: 12, marginTop: 8, fontWeight: "600" },
  input: { backgroundColor: "#fff", borderRadius: 14, paddingHorizontal: 16, height: 54, fontSize: 16, fontWeight: "700", color: colors.charcoal },
  emailBtn: { marginTop: 16, height: 54, borderRadius: 16, backgroundColor: colors.green, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  emailBtnTxt: { color: "#fff", fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  emailNote: { color: "rgba(255,255,255,0.5)", fontSize: 11, textAlign: "center", marginTop: 8 },
  activateBtn: { marginTop: 12, height: 58, borderRadius: 18, backgroundColor: colors.gold, alignItems: "center", justifyContent: "center" },
  activateBtnTxt: { color: colors.charcoal, fontWeight: "900", letterSpacing: 1.5, fontSize: 15 },
  later: { marginTop: 18, alignItems: "center" },
  laterTxt: { color: "rgba(255,255,255,0.6)", fontWeight: "700", fontSize: 14 },
});
