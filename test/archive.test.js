import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession, transition} from '../src/focusEngine.js';
import {createSessionRepository, STORAGE_KEY} from '../src/sessionRepository.js';
import {exportHistory, previewImport, parseArchive, canonicalJson} from '../src/archiveTools.js';
const session = (id,startedAt=0) => transition(createSession({id,intention:'Private work',durationMinutes:5,startedAt}),{type:'tick'},startedAt+300000);
const empty = {active:null,sessions:[]};
function driver() {
  const data=new Map();return {data,getItem:async key=>data.get(key)??null,setItem:async(key,value)=>data.set(key,value)};
}
test('preview accounts for new records, duplicates and retention before writes',()=>{
  const raw=exportHistory([session('a'),session('b',1000),session('c',2000)]).raw;
  const result=previewImport({...empty,sessions:[session('a')]},raw,{historyLimit:2});
  assert.deepEqual(result,{incomingSessions:3,added:2,duplicates:1,dropped:1,retainedSessions:2,focusedMinutes:15});
});
test('equivalent JSON property order does not create a conflicting session',async()=>{
  const storage=driver(), repository=createSessionRepository(storage);
  const raw=exportHistory([session('a')]).raw;
  await repository.importArchive(raw);
  const archive=JSON.parse(raw);
  archive.sessions[0]=Object.fromEntries(Object.entries(archive.sessions[0]).reverse());
  await repository.importArchive(JSON.stringify(archive));
  assert.equal((await repository.load()).sessions.length,1);
  assert.equal(canonicalJson({b:2,a:1}),canonicalJson({a:1,b:2}));
});
test('redaction removes intention and distraction text without changing the source',()=>{
  const original={...session('a'),interruptions:[{at:1000,reason:'Private reason'}]};
  const result=exportHistory([original],{redact:true});
  assert.ok(!result.raw.includes('Private'));
  assert.equal(original.intention,'Private work');assert.equal(original.interruptions[0].reason,'Private reason');
  assert.equal(parseArchive(result.raw).sessions[0].elapsedBeforeRun,300);
});
test('inclusive export windows exclude other sessions and invalid windows fail',()=>{
  const result=exportHistory([session('a',0),session('b',1000),session('c',2000)],{from:1000,to:1000});
  assert.deepEqual(parseArchive(result.raw).sessions.map(item=>item.id),['b']);
  assert.throws(()=>exportHistory([],{from:NaN}));assert.throws(()=>exportHistory([],{from:2,to:1}));
});
test('conflicts, active sessions, malformed data and oversized text never overwrite disk',async()=>{
  const storage=driver(), repository=createSessionRepository(storage);
  const raw=exportHistory([session('a')]).raw;await repository.importArchive(raw);
  const before=storage.data.get(STORAGE_KEY);
  const bad=JSON.parse(raw);bad.sessions[0].intention='Different';
  for(const input of [JSON.stringify(bad),'not json',' '.repeat(5_000_001)]) await assert.rejects(repository.importArchive(input));
  assert.equal(storage.data.get(STORAGE_KEY),before);
  const active={version:2,revision:0,sessions:[],active:createSession({id:'running',intention:'Study',durationMinutes:5,startedAt:0})};
  assert.throws(()=>previewImport(empty,JSON.stringify(active)),/Finish/);
});
test('write-time revalidation catches a conflict introduced after preview',async()=>{
  const storage=driver(), repository=createSessionRepository(storage), raw=exportHistory([session('a')]).raw;
  assert.equal(previewImport(empty,raw).added,1);
  const competing=JSON.parse(raw);competing.sessions[0].intention='Another device';
  await repository.importArchive(JSON.stringify(competing));
  await assert.rejects(repository.importArchive(raw),/Conflicting/);
  assert.equal((await repository.load()).sessions[0].intention,'Another device');
});
