import {decodeArchive as decode, validateSession} from './sessionSchema.js';
import {mergeArchive, parseArchive} from './archiveTools.js';
export {validateSession} from './sessionSchema.js';
import {SessionStatus, transition} from './focusEngine.js';

export const STORAGE_KEY = 'unplugged:state:v2';
export const LEGACY_KEY = 'unplugged:sessions:v1';
const terminal = new Set([SessionStatus.COMPLETED, SessionStatus.ABANDONED]);

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
      const imported = parseArchive(raw);
      return mutate(state => {
        if (state.active || imported.active) throw new Error('Finish active sessions before importing');
        const merged = mergeArchive(state, imported, {historyLimit});
        return {...state, sessions: merged.sessions};
      });
    })
  };
}
