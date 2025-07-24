import {SessionStatus, transition} from './focusEngine.js';

export const STORAGE_KEY = 'unplugged:state:v2';
export const LEGACY_KEY = 'unplugged:sessions:v1';
const terminal = new Set([SessionStatus.COMPLETED, SessionStatus.ABANDONED]);

export function validateSession(value) {
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' || !value.id ||
      typeof value.intention !== 'string' || !value.intention.trim() ||
      !Number.isInteger(value.targetSeconds) || value.targetSeconds < 300 || value.targetSeconds > 10800 ||
      !Number.isFinite(value.elapsedBeforeRun) || value.elapsedBeforeRun < 0 || value.elapsedBeforeRun > value.targetSeconds ||
      !Object.values(SessionStatus).includes(value.status) || value.status === SessionStatus.IDLE ||
      !Number.isFinite(value.createdAt) || !Array.isArray(value.interruptions)) {
    throw new Error('Invalid saved session');
  }
  if (value.status === SessionStatus.COMPLETED && value.elapsedBeforeRun !== value.targetSeconds) throw new Error('Incomplete session marked completed');
  if (value.status === SessionStatus.RUNNING && (!Number.isFinite(value.runStartedAt) || value.runStartedAt < value.createdAt)) {
    throw new Error('Invalid running-session clock');
  }
  if (value.status !== SessionStatus.RUNNING && value.runStartedAt !== null) throw new Error('Inactive session has a running clock');
  if (terminal.has(value.status) && (!Number.isFinite(value.completedAt) || value.completedAt < value.createdAt)) {
    throw new Error('Invalid completion time');
  }
  for (const item of value.interruptions) {
    if (!Number.isFinite(item.at) || item.at < value.createdAt || typeof item.reason !== 'string') throw new Error('Invalid interruption');
  }
  return JSON.parse(JSON.stringify(value));
}

function decode(raw) {
  const value = JSON.parse(raw);
  if (value.version !== 2 || !Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.sessions)) {
    throw new Error('Unsupported focus archive');
  }
  const sessions = value.sessions.map(validateSession);
  if (sessions.some(session => !terminal.has(session.status))) throw new Error('History contains an unfinished session');
  const ids = new Set(sessions.map(session => session.id));
  if (ids.size !== sessions.length) throw new Error('Duplicate saved session');
  const active = value.active === null ? null : validateSession(value.active);
  if (active && (terminal.has(active.status) || ids.has(active.id))) throw new Error('Invalid active session');
  return {version: 2, revision: value.revision, sessions, active};
}

/** Serialize read-modify-write operations around an injected AsyncStorage-compatible driver. */
export function createSessionRepository(storage, {historyLimit = 1000} = {}) {
  if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new Error('Invalid history limit');
  let pending = Promise.resolve();
  const serialize = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  async function read() {
    const raw = await storage.getItem(STORAGE_KEY);
    if (raw !== null) return decode(raw);
    const legacy = await storage.getItem(LEGACY_KEY);
    const sessions = legacy === null ? [] : JSON.parse(legacy).map(validateSession).filter(item => terminal.has(item.status));
    return decode(JSON.stringify({version: 2, revision: 0, sessions, active: null}));
  }
  async function mutate(update) {
    const previous = await read();
    const next = update(previous);
    next.sessions = next.sessions.slice(-historyLimit);
    next.revision = previous.revision + 1;
    const checked = decode(JSON.stringify(next));
    await storage.setItem(STORAGE_KEY, JSON.stringify(checked));
    return checked;
  }
  return {
    load: () => serialize(read),
    start: session => serialize(() => mutate(state => {
      if (state.active) throw new Error('A session is already active');
      validateSession(session);
      if (session.status !== SessionStatus.RUNNING || state.sessions.some(item => item.id === session.id)) throw new Error('Invalid new session');
      return {...state, active: session};
    })),
    dispatch: (event, now = Date.now()) => serialize(() => mutate(state => {
      if (!state.active) throw new Error('No active session');
      const active = transition(state.active, event, now);
      if (!terminal.has(active.status)) return {...state, active};
      return {...state, active: null, sessions: [...state.sessions, active]};
    })),
    recover: (now = Date.now()) => serialize(() => mutate(state => {
      if (state.active?.status !== SessionStatus.RUNNING) return state;
      // Timestamps, rather than interval ticks, determine completion after suspension.
      const active = transition(state.active, {type: 'tick'}, now);
      if (active.status !== SessionStatus.COMPLETED) return {...state, active};
      const finished = {...active, completedAt: state.active.runStartedAt + (state.active.targetSeconds - state.active.elapsedBeforeRun) * 1000};
      return {...state, active: null, sessions: [...state.sessions, finished]};
    })),
    exportArchive: () => serialize(async () => JSON.stringify(await read(), null, 2)),
    importArchive: raw => serialize(async () => {
      const imported = decode(raw);
      return mutate(state => {
        if (state.active || imported.active) throw new Error('Finish active sessions before importing');
        const merged = new Map(state.sessions.map(item => [item.id, item]));
        for (const item of imported.sessions) {
          if (merged.has(item.id) && JSON.stringify(merged.get(item.id)) !== JSON.stringify(item)) throw new Error(`Conflicting session ${item.id}`);
          merged.set(item.id, item);
        }
        return {...state, sessions: [...merged.values()].sort((a, b) => a.createdAt - b.createdAt)};
      });
    })
  };
}
