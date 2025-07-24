import {elapsedSeconds, SessionStatus} from './focusEngine.js';

function finished(sessions, now) {
  const seen = new Set();
  return sessions.filter(session => {
    if (seen.has(session.id) || session.createdAt > now || ![SessionStatus.COMPLETED,SessionStatus.ABANDONED].includes(session.status)) return false;
    seen.add(session.id); return true;
  });
}
function rateInterval(successes, count) {
  if (!count) return [0,1];
  const z = 1.96, p = successes / count, denominator = 1 + z*z/count;
  const center = (p + z*z/(2*count)) / denominator;
  const radius = z * Math.sqrt((p*(1-p) + z*z/(4*count))/count) / denominator;
  return [Math.max(0,center-radius),Math.min(1,center+radius)];
}

/** Summaries describe local history; a small sample is never presented as an optimum. */
export function durationInsights(sessions, now = Date.now()) {
  const groups = new Map();
  for (const session of finished(sessions, now)) {
    const minutes = session.targetSeconds / 60;
    const group = groups.get(minutes) ?? {minutes, attempts:0, completed:0, interruptions:0, focusedSeconds:0};
    group.attempts++;
    group.completed += Number(session.status === SessionStatus.COMPLETED);
    group.interruptions += session.interruptions.length;
    group.focusedSeconds += elapsedSeconds(session, now);
    groups.set(minutes, group);
  }
  return [...groups.values()].map(group => ({
    ...group, completionRate: group.completed / group.attempts,
    completionInterval: rateInterval(group.completed,group.attempts),
    interruptionsPerHour: group.focusedSeconds ? group.interruptions * 3600 / group.focusedSeconds : 0,
    enoughHistory: group.attempts >= 5
  })).sort((a,b) => a.minutes-b.minutes);
}

export function comparePeriods(sessions, {now = Date.now(), days = 7} = {}) {
  if (!Number.isInteger(days) || days < 1 || days > 90 || !Number.isFinite(now)) throw new Error('Invalid comparison window');
  const width = days * 86400000;
  const summary = items => {
    const completed = items.filter(session => session.status === SessionStatus.COMPLETED).length;
    return {sessions:items.length,completed,focusedMinutes: Math.round(items.reduce((sum,session) => sum + elapsedSeconds(session,now),0)/60),
      completionRate:items.length ? completed/items.length : null};
  };
  const eligible = finished(sessions,now);
  const current = summary(eligible.filter(session => session.createdAt > now-width));
  const previous = summary(eligible.filter(session => session.createdAt > now-2*width && session.createdAt <= now-width));
  return {days,current,previous,minuteChange:current.focusedMinutes-previous.focusedMinutes,
    completionRateChange: current.completionRate === null || previous.completionRate === null ? null : current.completionRate-previous.completionRate};
}

export function hourlyPatterns(sessions, now = Date.now()) {
  const buckets = Array.from({length:24},(_,hour) => ({hour,sessions:0,completed:0,minutes:0}));
  for (const session of finished(sessions,now)) {
    const group = buckets[new Date(session.createdAt).getUTCHours()];
    group.sessions++;
    group.completed += Number(session.status === SessionStatus.COMPLETED);
    group.minutes += elapsedSeconds(session,now)/60;
  }
  return buckets.map(group => ({...group,minutes:Math.round(group.minutes),completionRate:group.sessions ? group.completed/group.sessions : null}));
}

function csvCell(value) {
  let text = String(value);
  // Spreadsheet formulas must not execute when a user's intention is opened in Excel.
  if (/^[=+@-]/.test(text.trimStart())) text = "'" + text;
  return '"' + text.replace(/"/g,'""') + '"';
}
export function sessionsToCsv(sessions, now = Date.now()) {
  const rows = [['id','intention','started_utc','status','target_minutes','focused_minutes','interruptions']];
  for (const session of finished(sessions,now).sort((a,b) => a.createdAt-b.createdAt)) {
    rows.push([session.id,session.intention,new Date(session.createdAt).toISOString(),session.status,
      session.targetSeconds/60,(elapsedSeconds(session,now)/60).toFixed(2),session.interruptions.length]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
