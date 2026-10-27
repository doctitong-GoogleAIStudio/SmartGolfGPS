import "react-native-gesture-handler";
import "@/src/lib/locationTask"; // registers background location task (module side-effect)

import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { SettingsProvider } from "@/src/context/SettingsContext";
import { LicenseProvider, useLicense } from "@/src/context/LicenseContext";
import { ToastHost } from "@/src/components/ToastHost";
import { ActivationView } from "@/src/components/ActivationView";
import { ServiceProvider } from "@/src/context/ServiceContext";

LogBox.ignoreAllLogs(true);
SplashScreen.preventAutoHideAsync();

// Full-screen gate shown ONLY when the trial is over and the device isn't activated.
function LicenseGate() {
  const { ready, locked } = useLicense();
  if (!ready || !locked) return null;
  return (
    <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 5000 }}>
      <ActivationView />
    </View>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconErr] = useIconFonts();
  // Load brand fonts in the background — do NOT block boot on them (remote
  // fetch can stall on web and leave the app on a null render).
  useFonts({
    Anton: "https://cdn.jsdelivr.net/fontsource/fonts/anton@latest/latin-400-normal.ttf",
    Manrope: "https://cdn.jsdelivr.net/fontsource/fonts/manrope@latest/latin-800-normal.ttf",
  });

  const ready = iconsLoaded || iconErr;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ServiceProvider><SettingsProvider>
          <LicenseProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FDFDFD" } }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="activate" options={{ presentation: "modal" }} />
              <Stack.Screen name="account" />
            </Stack>
            <LicenseGate />
            <ToastHost />
          </LicenseProvider>
        </SettingsProvider></ServiceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
