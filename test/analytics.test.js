import test from "node:test";
import assert from "node:assert/strict";
import {recommendDuration, summarize} from "../src/analytics.js";
import {SessionStatus} from "../src/focusEngine.js";

const now = new Date("2026-08-04T12:00:00").valueOf();
function session(status, minutes, reason = null) {
  return {status,targetSeconds:minutes*60,elapsedBeforeRun:minutes*60,createdAt:now-1000,interruptions:reason?[{reason,at:now-500}]:[]};
}

test("weekly summary aggregates time and interruption pattern", () => {
  const result = summarize([session(SessionStatus.COMPLETED,25,"phone"),session(SessionStatus.ABANDONED,10,"phone")],now);
  assert.equal(result.focusedMinutes,35);
  assert.equal(result.completionRate,.5);
  assert.deepEqual(result.topInterruption,{reason:"phone",count:2});
});

test("recommendation increases after consistent completion", () => {
  const sessions = [session(SessionStatus.COMPLETED,25),session(SessionStatus.COMPLETED,25),session(SessionStatus.COMPLETED,25)];
  assert.equal(recommendDuration(sessions).minutes,30);
});

test("recommendation contracts after abandoned sessions", () => {
  const sessions = [session(SessionStatus.COMPLETED,25),session(SessionStatus.ABANDONED,25),session(SessionStatus.ABANDONED,25)];
  assert.equal(recommendDuration(sessions).minutes,20);
});

