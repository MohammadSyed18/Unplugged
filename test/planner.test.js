import test from 'node:test';
import assert from 'node:assert/strict';
import {createTask, planDay, rankTasks} from '../src/planner.js';
import {createPlannerRepository, PLANNER_KEY} from '../src/plannerRepository.js';
const task = (id, extra = {}) => createTask({id, title: id, ...extra});
function driver() {
  const data = new Map();
  return {data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value)};
}
test('overdue tasks lead, then priority and stable insertion order', () => {
  const tasks = [task('low', {priority:1}), task('high', {priority:3}), task('late', {priority:1,dueAt:0}), task('tie',{priority:3})];
  assert.deepEqual(rankTasks(tasks, 1000).map(item => item.id), ['late','high','tie','low']);
});
test('breaks consume the budget and no trailing break is inserted', () => {
  const plan = planDay([task('a',{minutes:60})], {startAt:0,availableMinutes:60});
  assert.deepEqual(plan.blocks.map(block => [block.kind, block.minutes]), [['focus',25],['break',5],['focus',25]]);
  assert.equal(plan.totalMinutes,55);
  assert.equal(plan.unusedMinutes,5);
  assert.equal(plan.unscheduled[0].minutes,10);
  for (let index=1;index<plan.blocks.length;index++) assert.equal(plan.blocks[index].startsAt,plan.blocks[index-1].endsAt);
});
test('small fragments are absorbed when they fit and completed tasks disappear', () => {
  const plan = planDay([task('a',{minutes:28}), {...task('done'),completedMinutes:25}], {startAt:0, availableMinutes:30});
  assert.equal(plan.blocks.length,1);
  assert.equal(plan.blocks[0].minutes,28);
  assert.deepEqual(plan.unscheduled,[]);
});
test('budgets stay bounded across different task lengths', () => {
  for (let minutes=5;minutes<=180;minutes+=7) {
    for (const budget of [5,30,60,120,720]) {
      const plan = planDay([task('a',{minutes}),task('b',{minutes:120})],{startAt:0,availableMinutes:budget});
      assert.ok(plan.totalMinutes<=budget);
      assert.equal(plan.totalMinutes,plan.blocks.reduce((sum,block)=>sum+block.minutes,0));
      assert.ok(plan.blocks.filter(block=>block.kind==='focus').every(block=>block.minutes>=5&&block.minutes<=180));
      assert.notEqual(plan.blocks.at(-1)?.kind,'break');
    }
  }
});
test('concurrent writes and repeated reconciliation never double-credit a session', async () => {
  const storage=driver(), repository=createPlannerRepository(storage);
  await Promise.all([repository.add(task('a')), repository.add(task('b'))]);
  const session={id:'s1',taskId:'a',status:'completed',elapsedBeforeRun:600};
  await Promise.all([repository.reconcile([session]),repository.reconcile([session])]);
  const state=await createPlannerRepository(storage).load();
  assert.equal(state.tasks.length,2);
  assert.equal(state.tasks[0].completedMinutes,10);
  assert.equal(state.creditedSessionIds.length,1);
});
test('failed writes can be retried and corrupt storage is not overwritten', async () => {
  const storage=driver(), repository=createPlannerRepository(storage);
  const write=storage.setItem;
  storage.setItem=async()=>{throw new Error('disk full');};
  await assert.rejects(repository.add(task('a')), /disk full/);
  storage.setItem=write;
  await repository.add(task('a'));
  storage.data.set(PLANNER_KEY,'broken');
  await assert.rejects(repository.add(task('b')));
  assert.equal(storage.data.get(PLANNER_KEY),'broken');
});
test('invalid and duplicate tasks fail before writes', async () => {
  assert.throws(()=>task('a',{minutes:NaN}));
  assert.throws(()=>planDay([task('a'),task('a')]));
  const repository=createPlannerRepository(driver());
  await repository.add(task('a'));
  await assert.rejects(repository.add(task('a')), /already exists/);
});

test('session storage recovery carries the task link into one-time progress credit', async () => {
  const {createSessionRepository}=await import('../src/sessionRepository.js');
  const {createSession}=await import('../src/focusEngine.js');
  const storage=driver(), planner=createPlannerRepository(storage), sessions=createSessionRepository(storage);
  await planner.add(task('a',{minutes:25}));
  await sessions.start({...createSession({id:'session-a',intention:'Study',durationMinutes:5,startedAt:0}),taskId:'a'});
  await sessions.dispatch({type:'pause'},60000);
  await sessions.dispatch({type:'resume'},600000);
  const recovered=await sessions.recover(900000);
  const state=await planner.reconcile(recovered.sessions);
  assert.equal(state.tasks[0].completedMinutes,5);
  assert.equal((await createPlannerRepository(storage).reconcile(recovered.sessions)).tasks[0].completedMinutes,5);
});
