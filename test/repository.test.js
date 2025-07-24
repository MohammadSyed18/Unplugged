import test from 'node:test';
import assert from 'node:assert/strict';
import {createSessionRepository, STORAGE_KEY, LEGACY_KEY} from '../src/sessionRepository.js';
import {createSession} from '../src/focusEngine.js';
const session = id => createSession({id, intention: 'Study', durationMinutes: 5, startedAt: 0});
function storage() {
  const data = new Map();
  return {data, getItem: async key => data.get(key) ?? null, setItem: async (key, value) => data.set(key, value)};
}
test('suspended sessions complete once at their real deadline', async () => {
  const driver = storage(), repository = createSessionRepository(driver);
  await repository.start(session('a'));
  const recovered = await repository.recover(600000);
  assert.equal(recovered.active, null);
  assert.equal(recovered.sessions[0].completedAt, 300000);
  assert.equal((await repository.recover(900000)).sessions.length, 1);
});
test('serialized events retain concurrent interruptions and paused clocks', async () => {
  const repository = createSessionRepository(storage());
  await repository.start(session('a'));
  await Promise.all([repository.dispatch({type: 'interrupt', reason: 'phone'}, 1000), repository.dispatch({type: 'interrupt', reason: 'noise'}, 2000)]);
  await repository.dispatch({type: 'pause'}, 5000);
  const state = await repository.recover(900000);
  assert.equal(state.active.elapsedBeforeRun, 5);
  assert.equal(state.active.interruptions.length, 2);
  await assert.rejects(repository.start(session('b')), /already active/);
  await repository.dispatch({type: 'abandon'}, 900001);
  assert.equal((await repository.load()).sessions.length, 1);
});
test('malformed archives fail without overwriting stored history', async () => {
  const driver = storage(), repository = createSessionRepository(driver);
  await repository.start(session('a'));
  await repository.dispatch({type: 'abandon'}, 1000);
  const before = driver.data.get(STORAGE_KEY);
  await assert.rejects(repository.importArchive('{bad'));
  assert.equal(driver.data.get(STORAGE_KEY), before);
  const exported = await repository.exportArchive();
  await repository.importArchive(exported);
  assert.equal((await repository.load()).sessions.length, 1);
  const changed = JSON.parse(exported); changed.sessions[0].intention = 'Different';
  await assert.rejects(repository.importArchive(JSON.stringify(changed)), /Conflicting/);
});
test('legacy history migrates and storage failure is recoverable', async () => {
  const driver = storage();
  driver.data.set(LEGACY_KEY, '[]');
  const repository = createSessionRepository(driver);
  assert.equal((await repository.load()).revision, 0);
  const original = driver.setItem;
  driver.setItem = async () => { throw new Error('disk full'); };
  await assert.rejects(repository.start(session('a')), /disk full/);
  driver.setItem = original;
  await repository.start(session('b'));
  assert.equal((await repository.load()).active.id, 'b');
});
