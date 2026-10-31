import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeed, taskGroup, reviewChanges, needsSupport, safeURL, goalAverage } from '../js/domain.js';
import { createDemoStore } from '../js/store.js';
const memory=new Map();
globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};

test('overdue dates use local calendar days and never reclassify submitted work',()=>{
  assert.equal(taskGroup({status:'assigned',dueDate:'2026-10-30'},'2026-10-31'),'overdue');
  assert.equal(taskGroup({status:'assigned',dueDate:'2026-10-31'},'2026-10-31'),'upcoming');
  assert.equal(taskGroup({status:'submitted',dueDate:'2026-10-01'},'2026-10-31'),'submitted');
  assert.equal(taskGroup({status:'completed',dueDate:'2026-10-01'},'2026-10-31'),'completed');
});
test('review updates a goal without mutating its input, rejects stale review and invalid scores',()=>{
  const seed=createSeed(),task=seed.assignments.find(a=>a.status==='submitted'),s=seed.students.find(s=>s.id===task.studentId),before=s.goals[0].progress;
  const result=reviewChanges(task,s,{score:'93',feedback:'Great reasoning!',goalId:s.goals[0].id,progress:'95'});
  assert.equal(result.task.status,'completed');assert.equal(result.task.score,93);assert.equal(result.goals[0].progress,95);assert.equal(s.goals[0].progress,before);
  assert.throws(()=>reviewChanges(result.task,s,{score:'99',feedback:'again'}),/already changed/);
  assert.throws(()=>reviewChanges(task,s,{score:'101',feedback:'x'}),/between/);
  assert.throws(()=>reviewChanges(task,s,{score:'',feedback:'x',goalId:'missing',progress:30}),/valid goal/);
});
test('assignment workflow persists, isolates demo student views, and records one review',async()=>{
  memory.clear();const store=createDemoStore();let tutorView,studentView;
  const tutor={uid:'demo-tutor',role:'tutor'},student={uid:'new-student',studentId:'new-student',role:'student'};
  store.subscribe(tutor,d=>tutorView=d);
  const sid=await store.add('students',{name:'Test Learner',email:'test@example.com',tutorId:tutor.uid,goals:[{id:'g',title:'Learn forces',progress:10}],subjects:['Physics'],level:'Year 8'});
  student.studentId=sid;
  const [id]=await store.createAssignments([{tutorId:tutor.uid,studentId:sid,studentEmail:'test@example.com',status:'assigned',kind:'response',title:'Explain a force',dueDate:'2099-01-01',response:'',submissionFiles:[],attachments:[]}]);
  store.subscribe(student,d=>studentView=d);
  assert.equal(studentView.students.length,1);assert.equal(studentView.assignments.length,1);assert.equal(studentView.notes.length,0);assert.equal(studentView.sessions.length,0);
  await assert.rejects(store.submit('task-0','No access'),/cannot be submitted/);
  await assert.rejects(store.add('notes',{}),/Tutor access/);
  await assert.rejects(store.submit(id,''),/response/);
  await store.submit(id,'A force is a push or pull.');assert.equal(studentView.assignments[0].status,'submitted');
  await assert.rejects(store.submit(id,'Again'),/cannot be submitted/);
  store.subscribe(tutor,d=>tutorView=d);
  await store.review(id,{score:'90',feedback:'Clear explanation.',goalId:'g',progress:75});
  assert.equal(tutorView.assignments.find(a=>a.id===id).status,'completed');
  assert.equal(tutorView.students.find(s=>s.id===sid).goals[0].progress,75);
  assert.equal(tutorView.assessments.filter(a=>a.assignmentId===id).length,1);
  await assert.rejects(store.review(id,{score:'90',feedback:'Again',goalId:'g',progress:75}),/already changed/);
  const restored=createDemoStore();restored.subscribe(student,d=>studentView=d);
  assert.equal(studentView.assignments[0].feedback,'Clear explanation.');assert.equal(studentView.assessments[0].score,90);
});
test('simple tasks still go to tutor review and goal averages handle new students',async()=>{
  memory.clear();const store=createDemoStore();let view;store.subscribe({role:'student',studentId:'cayden'},d=>view=d);
  const task=view.assignments.find(a=>a.kind==='simple');await store.submit(task.id,'');assert.equal(view.assignments.find(a=>a.id===task.id).status,'submitted');
  assert.equal(goalAverage({goals:[]}),0);assert.equal(needsSupport({id:'x',goals:[]},[]),false);
});
test('resource URLs exclude script/data protocols',()=>{
  assert.equal(safeURL('javascript:alert(1)'),'');assert.equal(safeURL('data:text/html,test'),'');
  assert.equal(safeURL('https://example.com/resource'),'https://example.com/resource');
});

import { toLoginEmail, shownId, isStudentLogin, validUsername, makePassword } from '../js/domain.js';
test('usernames map to hidden logins and back', () => {
  assert.equal(toLoginEmail(' Amira.K '), 'amira.k@students.plusultra.app');
  assert.equal(toLoginEmail('Parent@Example.com'), 'parent@example.com');
  assert.equal(shownId('amira.k@students.plusultra.app'), 'amira.k');
  assert.equal(shownId('parent@example.com'), 'parent@example.com');
  assert.ok(isStudentLogin('amira.k@students.plusultra.app') && !isStudentLogin('a@b.com'));
  assert.ok(validUsername('amira.k') && !validUsername('a') && !validUsername('has space') && !validUsername('x@y'));
  assert.match(makePassword(), /^[A-Za-z2-9]{12}$/);
});
