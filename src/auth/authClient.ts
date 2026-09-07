import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!apiUrl) {
  throw new Error("EXPO_PUBLIC_API_URL is not configured.");
}

export const authClient = createAuthClient({
  baseURL: `${apiUrl.replace(/\/+$/, "")}/auth`,
  plugins: [
    expoClient({
      scheme: "biteiq",
      storagePrefix: "biteiq",
      storage: SecureStore
    })
  ]
});
