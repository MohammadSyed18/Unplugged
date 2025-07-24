import test from 'node:test';
import assert from 'node:assert/strict';
import {durationInsights,comparePeriods,hourlyPatterns,sessionsToCsv} from '../src/insights.js';
import {createSession,transition} from '../src/focusEngine.js';
function item(id,date,complete=true) {
  const at = Date.parse(date);
  return transition(createSession({id,intention:'=SUM(1,2)',durationMinutes:25,startedAt:at}),{type:complete?'tick':'abandon'},at+(complete ? 1500000 : 900000));
}
test('duration evidence intervals tighten as independent sessions accumulate',()=>{
  const one=durationInsights([item('1','2026-01-01')]);
  const many=durationInsights(Array.from({length:10},(_,index)=>item(String(index),'2026-01-01')));
  assert.equal(one[0].enoughHistory,false);
  assert.equal(many[0].enoughHistory,true);
  assert.ok(many[0].completionInterval[0]>one[0].completionInterval[0]);
});
test('period comparison uses disjoint windows and keeps missing rate null',()=>{
  const now=Date.parse('2026-01-15');
  const result=comparePeriods([item('a','2026-01-14'),item('b','2026-01-07',false)],{now});
  assert.equal(result.current.sessions,1);assert.equal(result.previous.sessions,1);
  assert.equal(result.completionRateChange,1);
  assert.equal(comparePeriods([],{now}).completionRateChange,null);
});
test('hourly patterns use UTC and CSV quotes formulas safely',()=>{
  const session=item('a','2026-01-14T10:00:00Z');
  assert.equal(hourlyPatterns([session])[10].minutes,25);
  const csv=sessionsToCsv([session]);
  assert.ok(csv.includes('"\'=SUM(1,2)"'));
  assert.equal(csv.split('\r\n').length,3);
});
