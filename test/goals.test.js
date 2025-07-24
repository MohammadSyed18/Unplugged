import test from 'node:test';
import assert from 'node:assert/strict';
import {goalProgress, buildRoutine, interruptionInsights} from '../src/goals.js';
import {createSession, transition} from '../src/focusEngine.js';
function finished(id, date) {
  const start = Date.parse(date);
  return transition(createSession({id, intention: 'Read', durationMinutes: 25, startedAt: start}), {type: 'tick'}, start + 1500000);
}
test('goals deduplicate sessions, preserve yesterday streak, and exclude future work', () => {
  const a = finished('a', '2026-10-20T10:00Z'), b = finished('b', '2026-10-21T10:00Z');
  const result = goalProgress([a, a, b, finished('future', '2027-01-01')], {dailyMinutes: 20, now: Date.parse('2026-10-22T10:00Z')});
  assert.equal(result.currentStreak, 2);
  assert.equal(result.longestStreak, 2);
  assert.equal(result.weekMinutes, 50);
  assert.equal(result.todayMinutes, 0);
});
test('routine uses a long break after four blocks and has no trailing break', () => {
  const result = buildRoutine({blocks: 5});
  assert.equal(result.stages.length, 9);
  assert.equal(result.stages[7].minutes, 15);
  assert.equal(result.stages.at(-1).kind, 'focus');
  assert.equal(result.totalMinutes, 155);
  assert.throws(() => buildRoutine({blocks: 0}));
});
test('interruption insights count affected sessions separately', () => {
  const item = finished('a', '2026-10-20');
  item.interruptions = [{reason: 'Phone', at: item.createdAt}, {reason: 'phone', at: item.createdAt}];
  assert.deepEqual(interruptionInsights([item], Date.parse('2026-10-22')), [{reason: 'phone', count: 2, affectedSessions: 1}]);
});
