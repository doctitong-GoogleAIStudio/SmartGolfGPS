import React from "react";
import { useRouter } from "expo-router";
import { ActivationView } from "@/src/components/ActivationView";

export default function ActivateRoute() {
  const router = useRouter();
  return <ActivationView onClose={() => router.back()} />;
}
