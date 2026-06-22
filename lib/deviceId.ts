import * as Application from "expo-application";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SECURE_STORE_KEY = "acilping_device_id";

function generate(): string {
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Kalıcı cihaz kimliği döndürür.
 *
 * iOS  → Keychain (SecureStore) — uygulama silinse bile Keychain'de kalır.
 * Android → androidId — cihaz düzeyinde sabit ID, fabrika sıfırlama haricinde değişmez.
 *
 * Fallback: her iki platform da başarısız olursa bellekte rastgele ID.
 */
export async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") {
      // Android ID: uygulama imzası + kullanıcı + cihaza bağlı, reinstall'da değişmez.
      const id = Application.getAndroidId();
      if (id) return id;
    }

    // iOS ve Android fallback: Keychain / SecureStore
    const stored = await SecureStore.getItemAsync(SECURE_STORE_KEY);
    if (stored) return stored;

    const newId = generate();
    await SecureStore.setItemAsync(SECURE_STORE_KEY, newId);
    return newId;
  } catch {
    // İzin hatası vs. — bellekte geçici ID (nadir durum)
    return generate();
  }
}
