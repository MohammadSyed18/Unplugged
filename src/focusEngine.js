export const SessionStatus = Object.freeze({
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETED: "completed",
  ABANDONED: "abandoned"
});

export function createSession({id, intention, durationMinutes, startedAt = Date.now()}) {
  if (!intention?.trim()) throw new Error("an intention is required");
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 180) {
    throw new Error("duration must be an integer from 5 to 180 minutes");
  }
  return {
    id,
    intention: intention.trim(),
    targetSeconds: durationMinutes * 60,
    elapsedBeforeRun: 0,
    runStartedAt: startedAt,
    status: SessionStatus.RUNNING,
    interruptions: [],
    createdAt: startedAt,
    completedAt: null
  };
}

export function elapsedSeconds(session, now = Date.now()) {
  const live = session.status === SessionStatus.RUNNING
    ? Math.max(0, Math.floor((now - session.runStartedAt) / 1000))
    : 0;
  return Math.min(session.targetSeconds, session.elapsedBeforeRun + live);
}

export function remainingSeconds(session, now = Date.now()) {
  return Math.max(0, session.targetSeconds - elapsedSeconds(session, now));
}

export function transition(session, event, now = Date.now()) {
  switch (event.type) {
    case "pause": {
      assertStatus(session, SessionStatus.RUNNING);
      return {...session, status: SessionStatus.PAUSED, elapsedBeforeRun: elapsedSeconds(session, now), runStartedAt: null};
    }
    case "resume": {
      assertStatus(session, SessionStatus.PAUSED);
      return {...session, status: SessionStatus.RUNNING, runStartedAt: now};
    }
    case "interrupt": {
      if (![SessionStatus.RUNNING, SessionStatus.PAUSED].includes(session.status)) throw new Error("session is not active");
      const reason = event.reason?.trim() || "unspecified";
      return {...session, interruptions: [...session.interruptions, {at: now, reason}]};
    }
    case "tick": {
      if (session.status !== SessionStatus.RUNNING || remainingSeconds(session, now) > 0) return session;
      return {...session, status: SessionStatus.COMPLETED, elapsedBeforeRun: session.targetSeconds, runStartedAt: null, completedAt: now};
    }
    case "abandon": {
      if (![SessionStatus.RUNNING, SessionStatus.PAUSED].includes(session.status)) throw new Error("session is not active");
      return {...session, status: SessionStatus.ABANDONED, elapsedBeforeRun: elapsedSeconds(session, now), runStartedAt: null, completedAt: now};
    }
    default:
      throw new Error(`unknown event: ${event.type}`);
  }
}

export function recoverSession(session, now = Date.now()) {
  if (!session || !Object.values(SessionStatus).includes(session.status)) return null;
  if (session.status !== SessionStatus.RUNNING) return session;
  return transition(session, {type: "tick"}, now);
}

function assertStatus(session, expected) {
  if (session.status !== expected) throw new Error(`expected ${expected}, got ${session.status}`);
}
