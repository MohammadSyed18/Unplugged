import test from "node:test";
import assert from "node:assert/strict";
import {createSession, elapsedSeconds, remainingSeconds, SessionStatus, transition} from "../src/focusEngine.js";

test("timer survives pauses without counting paused time", () => {
  const session = createSession({id:"1", intention:"Study", durationMinutes:5, startedAt:1_000});
  const paused = transition(session, {type:"pause"}, 61_000);
  assert.equal(elapsedSeconds(paused, 200_000), 60);
  const resumed = transition(paused, {type:"resume"}, 200_000);
  assert.equal(remainingSeconds(resumed, 230_000), 210);
});

test("tick completes a session at its target", () => {
  const session = createSession({id:"1", intention:"Study", durationMinutes:5, startedAt:0});
  const completed = transition(session, {type:"tick"}, 300_000);
  assert.equal(completed.status, SessionStatus.COMPLETED);
  assert.equal(completed.elapsedBeforeRun, 300);
});

test("interruptions preserve reason and timestamp", () => {
  const session = createSession({id:"1", intention:"Study", durationMinutes:5, startedAt:0});
  const changed = transition(session, {type:"interrupt", reason:"notification"}, 12_000);
  assert.deepEqual(changed.interruptions[0], {at:12_000, reason:"notification"});
});


test('late pause or abandon completes at the deadline instead of losing finished work', () => {
  for (const type of ['pause','abandon','interrupt']) {
    const result=transition(createSession({id:'a',intention:'Study',durationMinutes:5,startedAt:0}),{type},600000);
    assert.equal(result.status,SessionStatus.COMPLETED);
    assert.equal(result.completedAt,300000);
  }
});
test('invalid and backwards clocks fail before changing state', () => {
  assert.throws(()=>createSession({id:'',intention:'Study',durationMinutes:5}));
  const session=createSession({id:'a',intention:'Study',durationMinutes:5,startedAt:1000});
  for (const now of [NaN,Infinity,0]) assert.throws(()=>transition(session,{type:'pause'},now),/clock/);
});
