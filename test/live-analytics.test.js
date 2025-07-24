import test from "node:test";
import assert from "node:assert/strict";
import {createSession, transition} from "../src/focusEngine.js";
import {summarize} from "../src/analytics.js";
test("running time is included and paused time is excluded", () => {
 const start=Date.UTC(2025,6,1,10);
 const session=createSession({id:"a",intention:"Study",durationMinutes:25,startedAt:start});
 assert.equal(summarize([session],start+120000).focusedMinutes,2);
 const paused=transition(session,{type:"pause"},start+60000);
 assert.equal(summarize([paused],start+120000).focusedMinutes,1);
});
test("future sessions do not enter the current week's analytics", () => {
 const now=Date.UTC(2025,6,1);
 const future=createSession({id:"a",intention:"Study",durationMinutes:25,startedAt:now+86400000});
 assert.equal(summarize([future],now).sessions,0);
});
