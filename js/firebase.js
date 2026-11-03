import { driveApiURL } from '../integrations-config.js';
import { editableChanges, replaceGoal } from './editing.js';
import { reviewChanges, uid, validateFile, today, isStudentLogin } from './domain.js';
const BASE = 'https://www.gstatic.com/firebasejs/13.1.0';
export async function createFirebaseStore(config, onAuth, onError) {
  if (!config.projectId || config.projectId.includes('YOUR_')) throw new Error('Complete firebase-config.js before enabling Firebase.');
  const [core, authSDK, dbSDK, storageSDK] = await Promise.all([
    import(`${BASE}/firebase-app.js`), import(`${BASE}/firebase-auth.js`),
    import(`${BASE}/firebase-firestore.js`), import(`${BASE}/firebase-storage.js`)
  ]);
  const app=core.initializeApp(config), auth=authSDK.getAuth(app), db=dbSDK.getFirestore(app), storage=storageSDK.getStorage(app);
  let activeUser=null, sessionCleanups=[], cleanups=[], authGeneration=0;
  function stop() { cleanups.forEach(fn=>fn());cleanups=[];sessionCleanups.forEach(fn=>fn());sessionCleanups=[]; }
  async function identify(user) {
    const generation=++authGeneration;
    stop();activeUser=null;
    if(!user) {onAuth(null);return;}
    if(!user.emailVerified&&!isStudentLogin(user.email)) {onAuth({uid:user.uid,email:user.email,unverified:true});return;}
    try {
      const doc=await dbSDK.getDoc(dbSDK.doc(db,'tutors',user.uid));
      if(generation!==authGeneration)return;
      activeUser={uid:user.uid,email:user.email.toLowerCase(),name:doc.exists()?doc.data().name:'Student',role:doc.exists()&&doc.data().active===true?'tutor':'student'};
      onAuth(activeUser);
    } catch(error) {if(generation===authGeneration)onError(error);}
  }
  await authSDK.setPersistence(auth,authSDK.browserSessionPersistence);
  authSDK.onAuthStateChanged(auth,identify,onError);
  function assignmentDoc(id) {return dbSDK.doc(db,'assignments',id);}
  async function upload(id,file,folder) {
    validateFile(file);
    if(driveApiURL)return driveRequest('/upload?'+new URLSearchParams({assignmentId:id,purpose:folder,mime:file.type,name:file.name}),{method:'POST',body:file,headers:{'Content-Type':'application/octet-stream'}});
    const snap=await dbSDK.getDoc(assignmentDoc(id));
    if(!snap.exists())throw new Error('Assignment not found.');
    const name=file.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100);
    const path=`work/${snap.data().tutorId}/${id}/${folder}/${uid()}-${name}`;
    await storageSDK.uploadBytes(storageSDK.ref(storage,path),file,{contentType:file.type});
    return {name:file.name,path};
  }
  async function driveRequest(path,options={}) {
    if(!driveApiURL)throw new Error('Deploy the Drive backend and set integrations-config.js first.');
    const token=await auth.currentUser.getIdToken();
    const response=await fetch(driveApiURL.replace(/\/$/,'')+path,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});
    if(!response.ok){let message='Drive request failed.';try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
    return path.startsWith('/download')?response.blob():response.json();
  }
  return {
    mode:'firebase',
    driveEnabled:!!driveApiURL,
    async connectDrive(){return driveRequest('/connect',{method:'POST'});},
    async driveStatus(){return driveRequest('/status');},
    watchMessages(studentId,callback,error) {
      const q=dbSDK.query(dbSDK.collection(db,'students',studentId,'messages'),dbSDK.orderBy('createdAt','desc'),dbSDK.limit(100));
      return dbSDK.onSnapshot(q,snap=>callback(snap.docs.map(doc=>({...doc.data(),id:doc.id})).reverse()),error);
    },
    async sendMessage(studentId,body) {
      if(!activeUser)throw new Error('Sign in first.');
      body=body.trim();if(!body||body.length>5000)throw new Error('Write a message of up to 5,000 characters.');
      await dbSDK.addDoc(dbSDK.collection(db,'students',studentId,'messages'),{body,senderId:activeUser.uid,senderRole:activeUser.role,createdAt:dbSDK.serverTimestamp()});
    },
    async login(email,password) {await authSDK.signInWithEmailAndPassword(auth,email,password);},
    async loginWithGoogle() {const provider=new authSDK.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});await authSDK.signInWithPopup(auth,provider);},
    async createStudentLogin(email,password) {
      const secondary=core.initializeApp(config,'student-setup-'+Date.now());
      try {
        const secondaryAuth=authSDK.getAuth(secondary);
        await authSDK.createUserWithEmailAndPassword(secondaryAuth,email,password);
        await authSDK.signOut(secondaryAuth);
      } finally {await core.deleteApp(secondary).catch(()=>{});}
    },
    async setOwnPassword(password) {if(activeUser?.role!=='tutor')throw new Error('Tutor access required.');await authSDK.updatePassword(auth.currentUser,password);},
    async register(email,password) {const credential=await authSDK.createUserWithEmailAndPassword(auth,email,password);await authSDK.sendEmailVerification(credential.user);},
    async logout() {stop();activeUser=null;await authSDK.signOut(auth);},
    async resetPassword(email) {await authSDK.sendPasswordResetEmail(auth,email);},
    async resendVerification() {await authSDK.sendEmailVerification(auth.currentUser);},
    async refreshVerification() {await authSDK.reload(auth.currentUser);await auth.currentUser.getIdToken(true);await identify(auth.currentUser);},
    subscribe(user,callback,error) {
      stop();const view={students:[],assignments:[],sessions:[],notes:[],assessments:[]};
      const collections=user.role==='tutor'?Object.keys(view):['students','assignments','assessments'];
      const loaded=new Set();let sessionIds='', sessionRows={};
      function emit() {if(loaded.size===collections.length)callback(structuredClone(view));}
      function watchSessions(students) {
        const ids=students.map(s=>s.id).sort().join(',');
        if(ids===sessionIds)return;sessionIds=ids;
        sessionCleanups.forEach(fn=>fn());sessionCleanups=[];sessionRows={};view.sessions=[];
        for(const student of students) {
          const q=dbSDK.query(dbSDK.collection(db,'sessions'),dbSDK.where('studentId','==',student.id));
          sessionCleanups.push(dbSDK.onSnapshot(q,snapshot=>{
            sessionRows[student.id]=snapshot.docs.map(doc=>({...doc.data(),id:doc.id}));
            view.sessions=Object.values(sessionRows).flat();emit();
          },error));
        }
      }
      for(const name of collections) {
        const filter=user.role==='tutor'?['tutorId','==',user.uid]:[name==='students'?'email':'studentEmail','==',user.email];
        const query=dbSDK.query(dbSDK.collection(db,name),dbSDK.where(...filter));
        cleanups.push(dbSDK.onSnapshot(query,snapshot=>{
          view[name]=snapshot.docs.map(doc=>({...doc.data(),id:doc.id}));loaded.add(name);
          if(name==='students'&&user.role==='student')watchSessions(view.students);
          emit();
        },error));
      }
      return stop;
    },
    async add(collection,value) {const ref=await dbSDK.addDoc(dbSDK.collection(db,collection),value);return ref.id;},
    async updateGoal(studentId,goalId,value) {
      if(activeUser?.role!=='tutor')throw new Error('Tutor access required.');
      const ref=dbSDK.doc(db,'students',studentId);
      await dbSDK.runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists())throw new Error('Student not found.');tx.update(ref,{goals:replaceGoal(snap.data().goals,goalId,value)});});
    },
    async updateRecord(collection,id,value) {
      if(activeUser?.role!=='tutor')throw new Error('Tutor access required.');
      const changes=editableChanges(collection,value),ref=dbSDK.doc(db,collection,id);
      const linked=collection==='assignments'?await dbSDK.getDocs(dbSDK.query(dbSDK.collection(db,'assessments'),dbSDK.where('tutorId','==',activeUser.uid),dbSDK.where('assignmentId','==',id))):null;
      const newAssessment=dbSDK.doc(dbSDK.collection(db,'assessments'));
      await dbSDK.runTransaction(db,async tx=>{
        const snap=await tx.get(ref);if(!snap.exists())throw new Error('Record not found.');
        const record={...snap.data(),...changes};
        if(record.tutorId!==activeUser.uid)throw new Error('Tutor access required.');
        if(collection==='assignments'&&snap.data().score!==null&&changes.score===null)throw new Error('A recorded score cannot be cleared. Enter a corrected score instead.');
        if(collection==='assessments'&&record.assignmentId) {
          const taskRef=assignmentDoc(record.assignmentId),task=await tx.get(taskRef);
          if(task.exists())tx.update(taskRef,{score:record.score});
        }
        tx.update(ref,changes);
        if(collection==='assignments'&&record.status==='completed'&&record.score!==null) {
          if(!linked.empty)linked.docs.forEach(doc=>tx.update(doc.ref,{score:record.score}));
          else tx.set(newAssessment,{tutorId:record.tutorId,studentId:record.studentId,studentEmail:record.studentEmail,title:record.title,date:today(),score:record.score,assignmentId:id});
        }
      });
    },
    async updateStudent(id,value) {await dbSDK.updateDoc(dbSDK.doc(db,'students',id),value);},
    async createAssignments(values) {
      if(values.length>8)throw new Error('Assign to up to 8 students at a time.');
      const batch=dbSDK.writeBatch(db),ids=[];
      values.forEach(value=>{const ref=dbSDK.doc(dbSDK.collection(db,'assignments'));ids.push(ref.id);batch.set(ref,value);});
      await batch.commit();return ids;
    },
    async submit(id,response,file) {
      const files=file?.size?[await upload(id,file,'submissions')]:[];
      await dbSDK.runTransaction(db,async transaction=>{
        const snap=await transaction.get(assignmentDoc(id));
        if(!snap.exists()||snap.data().status!=='assigned')throw new Error('This task has changed. Refresh and try again.');
        if(snap.data().kind!=='simple'&&!response.trim()&&!files.length)throw new Error('Write a response or attach your work.');
        transaction.update(assignmentDoc(id),{response,submissionFiles:files,status:'submitted',submittedAt:new Date().toISOString()});
      });
    },
    async attach(id,file) {const attachment=await upload(id,file,'resources');await dbSDK.updateDoc(assignmentDoc(id),{attachments:dbSDK.arrayUnion(attachment)});},
    async review(id,input) {
      const assessmentRef=dbSDK.doc(dbSDK.collection(db,'assessments'));
      await dbSDK.runTransaction(db,async transaction=>{
        const snap=await transaction.get(assignmentDoc(id));
        if(!snap.exists())throw new Error('Assignment not found.');
        const task={...snap.data(),id:snap.id}, studentRef=dbSDK.doc(db,'students',task.studentId);
        const studentSnap=await transaction.get(studentRef);
        const student={...studentSnap.data(),id:studentSnap.id}, change=reviewChanges(task,student,input);
        const {id:unused,...value}=change.task;
        transaction.set(assignmentDoc(id),value);
        if(input.goalId)transaction.update(studentRef,{goals:change.goals});
        if(value.score!==null)transaction.set(assessmentRef,{tutorId:activeUser.uid,studentId:student.id,studentEmail:student.email,title:task.title,date:today(),score:value.score,assignmentId:id});
      });
    },
    async download(file) {if(file.provider==='drive')return driveRequest('/download?'+new URLSearchParams({assetId:file.assetId}));return storageSDK.getBlob(storageSDK.ref(storage,file.path),10*1024*1024);}
  };
}
