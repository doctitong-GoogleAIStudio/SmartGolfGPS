import React, { createContext, useContext, useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { serviceSession, requireNativeSignIn } from "@/src/lib/serviceSession";
import { refreshApiConnection } from "@/src/lib/api";
import { stopBackgroundTracking } from "@/src/lib/locationTask";

const ServiceContext = createContext({ version: 0, signIn: async (_base: string, _email: string, _password: string) => {}, signOut: async () => true });

export function ServiceProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false), [version, setVersion] = useState(0), [error, setError] = useState("");
  useEffect(() => { serviceSession.restore().then(() => { refreshApiConnection();setReady(true); })
    .catch(() => setError("The saved golf connection could not be read. Existing local data has been retained.")); }, []);
  if (!ready) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
    {error ? <Text>{error}</Text> : <ActivityIndicator accessibilityLabel="Loading saved golf connection" />}</View>;
  const signIn = async (base: string, email: string, password: string) => {
    requireNativeSignIn();
    await stopBackgroundTracking();
    await serviceSession.signIn(base, email, password);
    refreshApiConnection();setVersion((value) => value + 1);
  };
  const signOut = async () => {
    await stopBackgroundTracking();
    const revoked = await serviceSession.signOut();
    refreshApiConnection();setVersion((value) => value + 1);
    return revoked;
  };
  return <ServiceContext.Provider value={{ version, signIn, signOut }}><React.Fragment key={version}>{children}</React.Fragment></ServiceContext.Provider>;
}

export const useService = () => useContext(ServiceContext);
