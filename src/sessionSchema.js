import {SessionStatus} from './focusEngine.js';
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
  if (value.taskId !== undefined && (typeof value.taskId !== 'string' || !value.taskId.trim())) throw new Error('Invalid task link');
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

export function decodeArchive(raw) {
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

