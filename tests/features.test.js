import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as domain from '../js/domain.js';
import {createDemoStore} from '../js/store.js';
import {editableChanges,replaceGoal} from '../js/editing.js';
import {themes,readTheme,themeKey} from '../js/customisation.js';
function memoryStorage(){const map=new Map();return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};}
globalThis.localStorage=memoryStorage();

test('tutor edits preserve submissions and correct linked assessment scores in both directions',async()=>{
  globalThis.localStorage=memoryStorage();const store=createDemoStore();let view;
  store.subscribe({role:'tutor',uid:'demo-tutor'},v=>view=v);
  const task=view.assignments.find(a=>a.status==='completed'),response=task.response;
  await store.updateRecord('assignments',task.id,{title:'Corrected title',score:94,feedback:'Corrected feedback'});
  assert.equal(view.assignments.find(a=>a.id===task.id).response,response);
  const assessment=view.assessments.find(a=>a.assignmentId===task.id);assert.equal(assessment.score,94);
  await store.updateRecord('assessments',assessment.id,{title:'Corrected checkpoint',score:89,date:'2026-10-31'});
  assert.equal(view.assignments.find(a=>a.id===task.id).score,89);
  assert.equal(view.assessments.filter(a=>a.assignmentId===task.id).length,1);
  await assert.rejects(store.updateRecord('assignments',task.id,{score:null}),/cannot be cleared/);
});
test('goals, session schedules and private notes can be corrected without changing ownership',async()=>{
  globalThis.localStorage=memoryStorage();const store=createDemoStore();let view;
  store.subscribe({role:'tutor',uid:'demo-tutor'},v=>view=v);
  const s=view.students[0],goal=s.goals[0];
  await store.updateGoal(s.id,goal.id,{title:'Revised goal',progress:81});
  assert.equal(view.students[0].goals[0].progress,81);assert.equal(view.students[0].goals.length,s.goals.length);
  const session=view.sessions[0];await store.updateRecord('sessions',session.id,{date:'2099-10-31',time:'17:00',duration:45,topic:'Revised focus',subject:'Physics'});
  assert.equal(view.sessions.find(a=>a.id===session.id).studentId,session.studentId);
  const note=view.notes[0];await store.updateRecord('notes',note.id,{text:'Corrected observation',date:'2026-10-31'});
  assert.equal(view.notes[0].text,'Corrected observation');
  assert.throws(()=>editableChanges('sessions',{studentId:'someone-else'}),/cannot be edited/);
  assert.throws(()=>editableChanges('assignments',{status:'completed'}),/cannot be edited/);
});
test('students receive only their own sessions and cannot mutate tutor records',async()=>{
  globalThis.localStorage=memoryStorage();const store=createDemoStore();let view;
  store.subscribe({uid:'cayden',studentId:'cayden',role:'student'},v=>view=v);
  assert.ok(view.sessions.length>0);assert.ok(view.sessions.every(s=>s.studentId==='cayden'));assert.equal(view.notes.length,0);
  await assert.rejects(store.updateRecord('sessions',view.sessions[0].id,{topic:'Hacked'}),/Tutor access/);
  await assert.rejects(store.updateGoal('cayden','forces',{title:'Hacked',progress:100}),/Tutor access/);
});
test('theme preferences are isolated per account and invalid choices safely fall back',()=>{
  const storage=memoryStorage(),t={uid:'tutor'},s={uid:'student'};
  storage.setItem(themeKey(t),'forest');storage.setItem(themeKey(s),'rose');
  assert.equal(readTheme(t,storage),'forest');assert.equal(readTheme(s,storage),'rose');
  storage.setItem(themeKey(s),'invalid');assert.equal(readTheme(s,storage),'lavender');
  assert.throws(()=>replaceGoal([{id:'g',title:'Goal',progress:10}],'g',{title:'Goal',progress:101}),/0 to 100/);
  assert.throws(()=>editableChanges('assignments',{link:'javascript:alert(1)'}),/http or https/);
});
test('rendered role navigation, settings guard, upcoming sessions, and edit forms match access',()=>{
  globalThis.localStorage=memoryStorage();
  const app={innerHTML:''},modal={innerHTML:'',close(){},showModal(){}},toast={textContent:'',classList:{add(){},remove(){}}};
  const context=vm.createContext({...domain,createDemoStore,themes,readTheme,applyTheme(){},saveTheme(){},settings:{businessName:'Plus Ultra',firebaseEnabled:false},
    document:{querySelector:s=>s==='#app'?app:s==='#modal'?modal:toast,addEventListener(){}},window:{scrollTo(){}},
    localStorage:globalThis.localStorage,structuredClone,crypto,setTimeout:()=>0,clearTimeout(){},console,URL});
  const source=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\ninit\(\);\s*$/,'');
  vm.runInContext(source,context);
  vm.runInContext("store=createDemoStore();beginSession({uid:'demo-tutor',role:'tutor',name:'Tutor'});",context);
  assert.match(app.innerHTML,/data-nav="customisation"/);assert.match(app.innerHTML,/data-nav="setup"/);
  vm.runInContext("editRecordForm('assignments','task-0');",context);assert.match(modal.innerHTML,/data-form="edit-record"/);
  vm.runInContext("beginSession({uid:'cayden',studentId:'cayden',role:'student'});",context);
  assert.match(app.innerHTML,/data-nav="customisation"/);assert.match(app.innerHTML,/data-nav="sessions"/);
  assert.doesNotMatch(app.innerHTML,/data-nav="setup"|Connect Firebase|data-form="changepass"/);
  assert.match(app.innerHTML,/Upcoming sessions/);
  vm.runInContext("navigate('setup');",context);
  assert.match(app.innerHTML,/Your colour theme/);assert.doesNotMatch(app.innerHTML,/Firebase is connected|Change password/);
  vm.runInContext("navigate('sessions');",context);
  assert.doesNotMatch(app.innerHTML,/data-edit-record|Schedule session/);
});
