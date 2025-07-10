import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "unplugged:sessions:v1";

export async function loadSessions() {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export async function saveSessions(sessions) {
  const trimmed = sessions.slice(-250);
  await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  return trimmed;
}

