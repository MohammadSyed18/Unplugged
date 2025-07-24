import {validateTasks, validateTask, creditSession} from './planner.js';
export const PLANNER_KEY = 'unplugged:planner:v1';
function decode(raw) {
  if (raw === null) return {version: 1, revision: 0, tasks: [], creditedSessionIds: []};
  const state = JSON.parse(raw);
  if (state.version !== 1 || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
      !Array.isArray(state.creditedSessionIds) || state.creditedSessionIds.length > 100000 ||
      state.creditedSessionIds.some(id => typeof id !== 'string' || !id) ||
      new Set(state.creditedSessionIds).size !== state.creditedSessionIds.length) throw new Error('Invalid saved planner');
  return {...state, tasks: validateTasks(state.tasks)};
}

/** One queue owns each read-modify-write; failed writes leave the next operation usable. */
export function createPlannerRepository(storage) {
  let pending = Promise.resolve();
  const queue = operation => {
    const result = pending.then(operation);
    pending = result.catch(() => {});
    return result;
  };
  const read = async () => decode(await storage.getItem(PLANNER_KEY));
  const mutate = async update => {
    const state = await read();
    const changed = update(state);
    if (changed === state) return state;
    const next = decode(JSON.stringify({...changed, revision: state.revision + 1}));
    await storage.setItem(PLANNER_KEY, JSON.stringify(next));
    return next;
  };
  return {
    load: () => queue(read),
    add: task => queue(() => mutate(state => {
      const checked = validateTask(task);
      if (state.tasks.some(item => item.id === checked.id)) throw new Error('Task already exists');
      return {...state, tasks: [...state.tasks, checked]};
    })),
    remove: id => queue(() => mutate(state => ({...state, tasks: state.tasks.filter(task => task.id !== id)}))),
    reconcile: sessions => queue(() => mutate(state => sessions.reduce((next, session) => creditSession(next, session), state)))
  };
}
