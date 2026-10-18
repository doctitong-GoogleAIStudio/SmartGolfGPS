import { Platform } from "react-native";
import { storage } from "@/src/utils/storage";
import { resolveApiBase } from "./backendConfig";
import { ServiceSessionManager } from "./serviceSessionCore";
import { setStorageScope } from "./storageScope";

export const serviceSession = new ServiceSessionManager(storage, (...args) => fetch(...args),
  resolveApiBase(process.env.EXPO_PUBLIC_API_URL, process.env.EXPO_PUBLIC_BACKEND_URL, __DEV__), __DEV__, setStorageScope);
export function requireNativeSignIn() {
  if (Platform.OS === "web") throw new Error("Account sign-in is available in the native app; this web preview does not have secure credential storage.");
}
