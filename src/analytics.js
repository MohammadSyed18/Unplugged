import {SessionStatus} from "./focusEngine.js";

export function summarize(sessions, now = Date.now()) {
  const sevenDaysAgo = now - 7 * 86_400_000;
  const recent = sessions.filter(session => session.createdAt >= sevenDaysAgo);
  const completed = recent.filter(session => session.status === SessionStatus.COMPLETED);
  const focusedSeconds = recent.reduce((total, session) => total + session.elapsedBeforeRun, 0);
  const interruptionCounts = new Map();
  for (const session of recent) {
    for (const interruption of session.interruptions) {
      interruptionCounts.set(interruption.reason, (interruptionCounts.get(interruption.reason) ?? 0) + 1);
    }
  }
  const topInterruption = [...interruptionCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
  return {
    sessions: recent.length,
    completed: completed.length,
    completionRate: recent.length ? completed.length / recent.length : 0,
    focusedMinutes: Math.round(focusedSeconds / 60),
    interruptions: recent.reduce((total, session) => total + session.interruptions.length, 0),
    topInterruption: topInterruption ? {reason: topInterruption[0], count: topInterruption[1]} : null,
    daily: dailyBuckets(recent, now)
  };
}

export function recommendDuration(sessions, fallback = 25) {
  const finished = sessions.filter(session => [SessionStatus.COMPLETED, SessionStatus.ABANDONED].includes(session.status)).slice(-12);
  if (finished.length < 3) return {minutes: fallback, reason: "Complete a few sessions to personalize this."};
  const completionRate = finished.filter(session => session.status === SessionStatus.COMPLETED).length / finished.length;
  const interruptionRate = finished.reduce((total, session) => total + session.interruptions.length, 0) / finished.length;
  const completedDurations = finished
    .filter(session => session.status === SessionStatus.COMPLETED)
    .map(session => Math.round(session.targetSeconds / 60));
  const median = completedDurations.length ? medianOf(completedDurations) : fallback;
  if (completionRate < 0.5 || interruptionRate >= 2) return {
    minutes: Math.max(10, median - 5),
    reason: completionRate < 0.5
      ? "Recent sessions often ended early, so the next block is smaller."
      : "Recent sessions had frequent interruptions, so the next block is easier to protect."
  };
  if (completionRate > 0.8) return {minutes: Math.min(60, median + 5), reason: "You have been finishing consistently; try a slightly longer block."};
  return {minutes: median, reason: "This length matches your recent completed sessions."};
}

function dailyBuckets(sessions, now) {
  return Array.from({length: 7}, (_, index) => {
    const dayStart = startOfDay(now - (6 - index) * 86_400_000);
    const dayEnd = dayStart + 86_400_000;
    const minutes = sessions
      .filter(session => session.createdAt >= dayStart && session.createdAt < dayEnd)
      .reduce((total, session) => total + session.elapsedBeforeRun / 60, 0);
    return {date: new Date(dayStart).toISOString().slice(0, 10), minutes: Math.round(minutes)};
  });
}

function startOfDay(timestamp) {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.valueOf();
}

function medianOf(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}
