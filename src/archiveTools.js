import {decodeArchive, validateSession} from './sessionSchema.js';

export const MAX_ARCHIVE_CHARACTERS = 5_000_000;

/** Canonical object keys make equivalent imports independent of JSON field order. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .map(key => JSON.stringify(key) + ':' + canonicalJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

export function parseArchive(raw) {
  if (typeof raw !== 'string' || raw.length > MAX_ARCHIVE_CHARACTERS) throw new Error('Archive exceeds the 5 MB text limit');
  const archive = decodeArchive(raw);
  if (archive.active) throw new Error('Finish the source device session before exporting an archive for import');
  return archive;
}

export function mergeArchive(current, incoming, {historyLimit = 1000} = {}) {
  if (!Number.isInteger(historyLimit) || historyLimit < 1) throw new Error('Invalid history limit');
  if (current.active || incoming.active) throw new Error('Finish active sessions before importing');
  const merged = new Map(current.sessions.map(session => [session.id, session]));
  let added = 0, duplicates = 0;
  const conflicts = [];
  for (const session of incoming.sessions) {
    const previous = merged.get(session.id);
    if (!previous) { merged.set(session.id, session); added++; }
    else if (canonicalJson(previous) === canonicalJson(session)) duplicates++;
    else conflicts.push(session.id);
  }
  if (conflicts.length) throw new Error(`Conflicting session IDs: ${conflicts.slice(0, 5).join(', ')}`);
  const all = [...merged.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return {sessions: all.slice(-historyLimit), added, duplicates, dropped: Math.max(0, all.length - historyLimit)};
}

/** Preview and write share the same merge rules; the repository rechecks at write time. */
export function previewImport(current, raw, options) {
  const incoming = parseArchive(raw);
  const merged = mergeArchive(current, incoming, options);
  return {incomingSessions: incoming.sessions.length, added: merged.added, duplicates: merged.duplicates,
    dropped: merged.dropped, retainedSessions: merged.sessions.length,
    focusedMinutes: Math.floor(incoming.sessions.reduce((sum, item) => sum + item.elapsedBeforeRun, 0) / 60)};
}

export function exportHistory(sessions, {from = -Infinity, to = Infinity, redact = false} = {}) {
  if (typeof from !== 'number' || Number.isNaN(from) || typeof to !== 'number' || Number.isNaN(to) || from > to || typeof redact !== 'boolean') {
    throw new Error('Invalid export window');
  }
  const selected = sessions.map(validateSession).filter(session => session.createdAt >= from && session.createdAt <= to)
    .map(session => redact ? {...session, intention: 'Focus session', interruptions: session.interruptions.map(item => ({...item, reason: 'distraction'}))} : session);
  const raw = JSON.stringify({version: 2, revision: 0, active: null, sessions: selected}, null, 2);
  return {raw, summary: previewImport({active: null, sessions: []}, raw)};
}
