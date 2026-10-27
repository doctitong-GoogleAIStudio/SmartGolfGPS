import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { serviceSession } from "@/src/lib/serviceSession";
import { useService } from "@/src/context/ServiceContext";
import { colors } from "@/src/theme";

export default function Account() {
  const router = useRouter(), insets = useSafeAreaInsets(), { signIn, signOut } = useService();
  const [base, setBase] = useState(serviceSession.apiBase || "");
  const [email, setEmail] = useState(serviceSession.session?.user.email || "");
  const [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false), [name, setName] = useState(""), [confirm, setConfirm] = useState("");
  const connected = !!serviceSession.token;
  const run = async (action: () => Promise<void>) => { setBusy(true);setMessage("");try { await action(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Could not connect. Please try again."); } finally { setBusy(false); } };
  return <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} accessibilityRole="button"><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.title}>Golf account</Text>
      <Text style={styles.body}>{connected ? `Signed in as ${serviceSession.session?.user.name}.` : "Connect your deployed golf service to save rounds and shots online."}</Text>
      <Text style={styles.label}>Golf API address</Text>
      <TextInput accessibilityLabel="Golf API address" testID="account-api-url" value={base} onChangeText={setBase} autoCapitalize="none" autoCorrect={false}
        keyboardType="url" placeholder="https://your-golf-service.example/api" editable={!connected && !busy} style={styles.input} />
      <Pressable disabled={busy || !base} accessibilityRole="button" style={[styles.secondary, busy && styles.disabled]}
        onPress={() => run(async () => { setMessage("Checking the golf service. The first connection may take up to a minute.");await serviceSession.probe(base);setMessage("Golf API and database are ready. You can sign in or create an account."); })} testID="account-test-connection">
        <Text style={styles.secondaryText}>{busy ? "CONNECTING…" : "TEST CONNECTION"}</Text></Pressable>
      {!connected && <>
        <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} testID="account-toggle-sign-up"
          onPress={() => { setCreating(!creating);setPassword("");setConfirm("");setMessage(""); }}>
          <Text style={styles.secondaryText}>{creating ? "HAVE AN ACCOUNT? SIGN IN" : "NEW GOLFER? CREATE ACCOUNT"}</Text>
        </Pressable>
        {creating && <><Text style={styles.label}>Name</Text><TextInput accessibilityLabel="Name" testID="account-name" value={name} onChangeText={setName} editable={!busy} autoComplete="name" style={styles.input} /></>}

        <Text style={styles.label}>Email</Text>
        <TextInput accessibilityLabel="Email" testID="account-email" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail}
          autoCapitalize="none" autoCorrect={false} editable={!busy} style={styles.input} />
        <Text style={styles.label}>Password</Text>
        <TextInput accessibilityLabel="Password" testID="account-password" secureTextEntry autoComplete={creating ? "new-password" : "current-password"} textContentType={creating ? "newPassword" : "password"}
          value={password} onChangeText={setPassword} autoCapitalize="none" autoCorrect={false} editable={!busy} style={styles.input} />
        {creating && <><Text style={styles.label}>Confirm password</Text><TextInput accessibilityLabel="Confirm password" testID="account-confirm-password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} style={styles.input} /></>}
        <Pressable accessibilityRole="button" disabled={busy || !base || !email || !password || Platform.OS === "web"} style={[styles.primary, (busy || !base || !email || !password) && styles.disabled]}
          onPress={() => run(async () => {
            if (creating) {
              if (password !== confirm) throw new Error("Passwords do not match.");
              await serviceSession.register(base, name, email, password);
              setPassword("");setConfirm("");setCreating(false);setMessage("Account created. Sign in with your email and password.");
            } else { await signIn(base, email, password);setPassword("");router.replace("/(tabs)/more"); }
          })} testID={creating ? "account-sign-up" : "account-sign-in"}><Text style={styles.primaryText}>{busy ? "CONNECTING…" : creating ? "CREATE ACCOUNT" : "SIGN IN"}</Text></Pressable>
        <Text style={styles.note}>{creating ? "Use a password of 12–1024 characters. New accounts are players; course mapping requires editor access. If creation times out, try signing in before submitting again." : "Existing device activation remains separate. This installation keeps one account binding to preserve saved data."}</Text>
      </>}
      {connected && <Pressable accessibilityRole="button" disabled={busy} style={styles.secondary} testID="account-sign-out" onPress={() => Alert.alert("Sign out of golf service?", "Saved rounds remain on this device. Device activation is preserved.", [
        { text: "Cancel", style: "cancel" }, { text: "Sign out", onPress: () => run(async () => { const revoked = await signOut();
          if (!revoked) Alert.alert("Signed out on this device", "The service could not confirm token revocation. The server session will expire automatically.");
          router.replace("/(tabs)/more"); }) },
      ])}><Text style={styles.secondaryText}>SIGN OUT</Text></Pressable>}
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.message} testID="account-status">{message}</Text>}
      {Platform.OS === "web" && <Text style={styles.note}>Use the native Android build for secure account sign-in.</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 22, paddingBottom: 48, gap: 12 }, back: { color: colors.green, fontSize: 16, paddingVertical: 8 },
  title: { fontSize: 30, fontWeight: "800", color: colors.charcoal }, body: { color: colors.charcoal, lineHeight: 22 },
  label: { fontWeight: "700", color: colors.charcoal, marginTop: 8 }, input: { backgroundColor: "#fff", borderColor: colors.zinc200, borderWidth: 1, borderRadius: 12, padding: 14, color: colors.charcoal },
  primary: { backgroundColor: colors.green, padding: 16, borderRadius: 12, alignItems: "center" }, primaryText: { color: "#fff", fontWeight: "800" },
  secondary: { borderColor: colors.green, borderWidth: 1, padding: 15, borderRadius: 12, alignItems: "center" }, secondaryText: { color: colors.green, fontWeight: "800" },
  disabled: { opacity: 0.45 }, note: { color: "#52525B", fontSize: 13, lineHeight: 20 }, message: { color: colors.charcoal, backgroundColor: "#fff", padding: 16, borderRadius: 12, lineHeight: 22 },
});
