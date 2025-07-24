import {elapsedSeconds, SessionStatus} from './focusEngine.js';

const DAY = 86_400_000;
const dayKey = value => new Date(value).toISOString().slice(0, 10);

/** UTC day buckets are explicit so traveling does not silently rewrite a streak. */
export function goalProgress(sessions, {dailyMinutes = 45, weeklyMinutes = 240, now = Date.now()} = {}) {
  if (![dailyMinutes, weeklyMinutes].every(value => Number.isInteger(value) && value > 0) || !Number.isFinite(now)) {
    throw new Error('Goals must be positive whole minutes');
  }
  const today = Date.parse(dayKey(now));
  const buckets = new Map();
  const seen = new Set();
  for (const session of sessions) {
    if (seen.has(session.id) || session.createdAt > now) continue;
    seen.add(session.id);
    const key = dayKey(session.createdAt);
    const value = buckets.get(key) ?? {seconds: 0, completed: 0};
    value.seconds += elapsedSeconds(session, now);
    value.completed += Number(session.status === SessionStatus.COMPLETED);
    buckets.set(key, value);
  }
  const days = Array.from({length: 28}, (_, index) => {
    const date = dayKey(today - (27 - index) * DAY);
    const value = buckets.get(date) ?? {seconds: 0, completed: 0};
    return {date, minutes: Math.floor(value.seconds / 60), completed: value.completed, met: value.seconds >= dailyMinutes * 60};
  });
  let currentStreak = 0;
  // A still-in-progress day does not break yesterday's streak.
  let cursor = buckets.get(dayKey(today))?.seconds >= dailyMinutes * 60 ? today : today - DAY;
  while ((buckets.get(dayKey(cursor))?.seconds ?? 0) >= dailyMinutes * 60) {
    currentStreak++;
    cursor -= DAY;
  }
  let longestStreak = 0, run = 0, last = null;
  for (const [date, value] of [...buckets].sort(([a], [b]) => a.localeCompare(b))) {
    const timestamp = Date.parse(date);
    run = value.seconds >= dailyMinutes * 60 ? (last === timestamp - DAY ? run + 1 : 1) : 0;
    longestStreak = Math.max(longestStreak, run);
    last = timestamp;
  }
  const weekMinutes = days.slice(-7).reduce((sum, day) => sum + day.minutes, 0);
  return {
    dailyMinutes, weeklyMinutes, currentStreak, longestStreak,
    todayMinutes: days.at(-1).minutes, weekMinutes,
    remainingToday: Math.max(0, dailyMinutes - days.at(-1).minutes),
    weeklyFraction: Math.min(1, weekMinutes / weeklyMinutes), days
  };
}

/** A bounded focus/break sequence, independent of notification permissions. */
export function buildRoutine({blocks = 4, focusMinutes = 25, shortBreak = 5, longBreak = 15} = {}) {
  if (!Number.isInteger(blocks) || blocks < 1 || blocks > 12 ||
      ![focusMinutes, shortBreak, longBreak].every(Number.isInteger) ||
      focusMinutes < 5 || focusMinutes > 180 || shortBreak < 1 || longBreak < shortBreak || longBreak > 60) {
    throw new Error('Invalid routine');
  }
  const stages = [];
  for (let index = 0; index < blocks; index++) {
    stages.push({kind: 'focus', minutes: focusMinutes, block: index + 1});
    if (index < blocks - 1) stages.push({kind: 'break', minutes: (index + 1) % 4 === 0 ? longBreak : shortBreak, block: index + 1});
  }
  return {stages, focusMinutes: blocks * focusMinutes, totalMinutes: stages.reduce((sum, stage) => sum + stage.minutes, 0)};
}

export function interruptionInsights(sessions, now = Date.now()) {
  const groups = new Map();
  for (const session of sessions.filter(item => item.createdAt <= now)) {
    for (const interruption of session.interruptions) {
      const key = interruption.reason.trim().toLowerCase() || 'unspecified';
      const item = groups.get(key) ?? {reason: key, count: 0, sessions: new Set()};
      item.count++;
      item.sessions.add(session.id);
      groups.set(key, item);
    }
  }
  return [...groups.values()].map(item => ({reason: item.reason, count: item.count, affectedSessions: item.sessions.size}))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}
