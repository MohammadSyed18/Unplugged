import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "unplugged:sessions:v1";
const ACTIVE_KEY = "unplugged:active:v1";

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

export async function loadActiveSession() {
  const raw = await AsyncStorage.getItem(ACTIVE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveActiveSession(session) {
  if (session) await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(session));
  else await AsyncStorage.removeItem(ACTIVE_KEY);
}
