const MINUTE = 60_000;
const MAX_TASKS = 100;

export function validateTask(task) {
  if (!task || typeof task !== 'object' || typeof task.id !== 'string' || !task.id.trim() ||
      typeof task.title !== 'string' || !task.title.trim() || task.title.length > 200 ||
      !Number.isInteger(task.minutes) || task.minutes < 5 || task.minutes > 1440 ||
      !Number.isInteger(task.priority) || task.priority < 1 || task.priority > 3 ||
      !Number.isInteger(task.completedMinutes) || task.completedMinutes < 0 || task.completedMinutes > task.minutes ||
      (task.dueAt !== null && !Number.isFinite(task.dueAt))) {
    throw new Error('Invalid planning task');
  }
  return {...task, title: task.title.trim()};
}

export function createTask({id, title, minutes = 25, priority = 2, dueAt = null}) {
  return validateTask({id, title, minutes, priority, dueAt, completedMinutes: 0});
}

export function validateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length > MAX_TASKS) throw new Error('A plan supports at most 100 tasks');
  const checked = tasks.map(validateTask);
  if (new Set(checked.map(task => task.id)).size !== checked.length) throw new Error('Duplicate task ID');
  return checked;
}

/** Stable priority ordering: overdue work, priority, deadline, then insertion order. */
export function rankTasks(tasks, now) {
  if (!Number.isFinite(now)) throw new Error('Invalid planning time');
  return validateTasks(tasks).map((task, index) => ({task, index}))
    .filter(({task}) => task.completedMinutes < task.minutes)
    .sort((a, b) => {
      const overdue = task => Number(task.dueAt !== null && task.dueAt <= now);
      return overdue(b.task) - overdue(a.task) || b.task.priority - a.task.priority ||
        (a.task.dueAt ?? Infinity) - (b.task.dueAt ?? Infinity) || a.index - b.index;
    }).map(({task}) => task);
}

/** A bounded, deterministic schedule; never invents time beyond the supplied budget. */
export function planDay(tasks, {startAt = Date.now(), availableMinutes = 120, blockMinutes = 25, breakMinutes = 5} = {}) {
  if (!Number.isFinite(startAt) || !Number.isInteger(availableMinutes) || availableMinutes < 5 || availableMinutes > 720 ||
      !Number.isInteger(blockMinutes) || blockMinutes < 5 || blockMinutes > 180 ||
      !Number.isInteger(breakMinutes) || breakMinutes < 1 || breakMinutes > 60) {
    throw new Error('Invalid planning budget');
  }
  const ranked = rankTasks(tasks, startAt);
  const blocks = [], allocations = new Map();
  let used = 0;
  for (const task of ranked) {
    let remaining = task.minutes - task.completedMinutes;
    while (remaining >= 5) {
      const gap = blocks.length ? breakMinutes : 0;
      const capacity = availableMinutes - used - gap;
      if (capacity < 5) break;
      let minutes = Math.min(blockMinutes, remaining, capacity);
      // Avoid leaving a 1–4 minute task fragment when it fits in this block.
      if (remaining - minutes > 0 && remaining - minutes < 5 && remaining <= capacity && remaining <= 180) minutes = remaining;
      if (gap) {
        blocks.push({kind: 'break', minutes: gap, startsAt: startAt + used * MINUTE, endsAt: startAt + (used + gap) * MINUTE});
        used += gap;
      }
      const endsAt = startAt + (used + minutes) * MINUTE;
      blocks.push({kind: 'focus', taskId: task.id, title: task.title, minutes,
        startsAt: startAt + used * MINUTE, endsAt,
        pastDeadline: task.dueAt !== null && endsAt > task.dueAt});
      used += minutes;
      remaining -= minutes;
      allocations.set(task.id, (allocations.get(task.id) ?? 0) + minutes);
    }
  }
  const unscheduled = ranked.map(task => ({taskId: task.id, title: task.title,
    minutes: task.minutes - task.completedMinutes - (allocations.get(task.id) ?? 0)})).filter(task => task.minutes > 0);
  return {blocks, unscheduled, focusMinutes: [...allocations.values()].reduce((a, b) => a + b, 0),
    totalMinutes: used, unusedMinutes: availableMinutes - used};
}

/** Progress is credited only from a terminal session, once per session ID. */
export function creditSession(state, session) {
  if (!session || !['completed', 'abandoned'].includes(session.status) || typeof session.id !== 'string' ||
      !Number.isFinite(session.elapsedBeforeRun) || session.elapsedBeforeRun < 0) throw new Error('A finished session is required');
  if (state.creditedSessionIds.includes(session.id)) return state;
  const tasks = validateTasks(state.tasks);
  if (!tasks.some(task => task.id === session.taskId)) return state;
  return {...state, tasks: tasks.map(task => task.id === session.taskId
    ? {...task, completedMinutes: Math.min(task.minutes, task.completedMinutes + Math.floor(session.elapsedBeforeRun / 60))} : task),
    creditedSessionIds: [...state.creditedSessionIds, session.id]};
}
