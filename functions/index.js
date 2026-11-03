import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {randomBytes,createHash} from 'node:crypto';
import {participant,checkUpload} from './policy.js';
initializeApp();const db=getFirestore();
const clientId=defineSecret('DRIVE_CLIENT_ID'),clientSecret=defineSecret('DRIVE_CLIENT_SECRET');
const options={region:'us-central1',secrets:[clientId,clientSecret],cors:true,maxInstances:5,timeoutSeconds:120,memory:'512MiB'};
const redirect=()=>`https://us-central1-${process.env.GCLOUD_PROJECT}.cloudfunctions.net/driveCallback`;
async function googleToken(body) {
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({...body,client_id:clientId.value(),client_secret:clientSecret.value()})});
  if(!response.ok)throw new Error('Google Drive authorization expired or failed. Ask the tutor to reconnect Drive.');return response.json();
}
async function access(uid) {
  const snap=await db.doc(`driveConnections/${uid}`).get();if(!snap.exists)throw new Error('The tutor needs to connect Google Drive in Settings.');
  const connection=snap.data(),token=await googleToken({grant_type:'refresh_token',refresh_token:connection.refreshToken});
  return {...connection,accessToken:token.access_token};
}
async function drive(token,path,init={}) {
  const response=await fetch('https://www.googleapis.com/'+path,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`}});
  if(!response.ok)throw new Error('Google Drive could not complete the request. Check the connection and available space.');return response;
}
async function authenticate(req) {
  const match=/^Bearer (.+)$/.exec(req.get('Authorization')||'');if(!match)throw new Error('Sign in first.');
  const user=await getAuth().verifyIdToken(match[1],true),profile=await db.doc(`tutors/${user.uid}`).get();
  return {user,isTutor:user.email_verified===true&&profile.exists&&profile.data().active===true};
}
export const driveApi=onRequest(options,async(req,res)=>{
  res.set('Cache-Control','no-store');
  try {
    const {user,isTutor}=await authenticate(req),route=req.path.replace(/\/$/,'');
    if(req.method==='GET'&&route==='/status') {
      if(!isTutor)throw new Error('Tutor access required.');
      const snap=await db.doc(`driveConnections/${user.uid}`).get();res.json({connected:snap.exists,folderURL:snap.exists?`https://drive.google.com/drive/folders/${snap.data().folderId}`:null});return;
    }
    if(req.method==='POST'&&route==='/connect') {
      if(!isTutor)throw new Error('Tutor access required.');
      const state=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
      await db.doc(`driveOAuthStates/${state}`).set({uid:user.uid,verifier,expiresAt:Date.now()+10*60000});
      const params=new URLSearchParams({client_id:clientId.value(),redirect_uri:redirect(),response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent select_account',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
      res.json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});return;
    }
    if(req.method==='POST'&&route==='/upload') {
      const id=String(req.query.assignmentId||'');if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('Invalid assignment.');
      const snap=await db.doc(`assignments/${id}`).get();if(!snap.exists)throw new Error('Assignment not found.');const task=snap.data();
      const purpose=String(req.query.purpose||''),mime=String(req.query.mime||''),body=req.rawBody;
      checkUpload(user,task,isTutor,purpose,mime,body?.length||0);
      const connection=await access(task.tutorId),name=String(req.query.name||'attachment').replace(/[\r\n\x00-\x1f]/g,'').slice(0,200),boundary='plusultra'+randomBytes(16).toString('hex');
      const metadata={name,parents:[connection.folderId],description:`Plus Ultra assignment ${id} · ${purpose}`};
      const upload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),body,Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const response=await drive(connection.accessToken,'upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:upload});
      const file=await response.json(),ref=db.collection('driveFiles').doc();
      await ref.set({fileId:file.id,tutorId:task.tutorId,assignmentId:id,name,mime,purpose,createdAt:new Date().toISOString()});
      res.json({provider:'drive',assetId:ref.id,name});return;
    }
    if(req.method==='GET'&&route==='/download') {
      const id=String(req.query.assetId||'');if(!/^[A-Za-z0-9_-]{1,128}$/.test(id))throw new Error('Invalid attachment.');
      const file=await db.doc(`driveFiles/${id}`).get();if(!file.exists)throw new Error('Attachment not found.');const asset=file.data();
      const task=await db.doc(`assignments/${asset.assignmentId}`).get();if(!task.exists||task.data().tutorId!==asset.tutorId||!participant(user,task.data(),isTutor))throw new Error('Access denied.');
      const connection=await access(asset.tutorId),response=await drive(connection.accessToken,`drive/v3/files/${encodeURIComponent(asset.fileId)}?alt=media`);
      let size=0;const chunks=[];
      for await(const chunk of response.body){size+=chunk.length;if(size>10*1024*1024)throw new Error('File exceeds the download limit.');chunks.push(chunk);}
      const bytes=Buffer.concat(chunks);
      res.set('Content-Type',asset.mime);res.set('X-Content-Type-Options','nosniff');res.set('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(asset.name)}`);res.send(bytes);return;
    }
    res.status(404).json({error:'Endpoint not found.'});
  }catch(error){res.status(400).json({error:error.code?.startsWith('auth/')?'Sign in again to continue.':error.message||'Request failed.'});}
});
export const driveCallback=onRequest({...options,cors:false},async(req,res)=>{
  res.set('Cache-Control','no-store');res.set('Content-Type','text/plain');res.set('Referrer-Policy','no-referrer');
  try {
    if(req.method!=='GET'||typeof req.query.state!=='string'||!/^[a-f0-9]{64}$/.test(req.query.state)||typeof req.query.code!=='string')throw new Error('Authorization was cancelled or incomplete. Start again from Settings.');
    const ref=db.doc(`driveOAuthStates/${req.query.state}`);
    const state=await db.runTransaction(async tx=>{const snap=await tx.get(ref);if(!snap.exists||snap.data().expiresAt<Date.now())throw new Error('This connection request expired. Start again in Settings.');tx.delete(ref);return snap.data();});
    const tutor=await db.doc(`tutors/${state.uid}`).get();if(!tutor.exists||tutor.data().active!==true)throw new Error('Tutor access required.');
    const tokens=await googleToken({grant_type:'authorization_code',code:req.query.code,redirect_uri:redirect(),code_verifier:state.verifier});
    if(!tokens.refresh_token)throw new Error('Google did not supply offline access. Reconnect and approve access.');
    const folder=await drive(tokens.access_token,'drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Plus Ultra Tutoring Attachments',mimeType:'application/vnd.google-apps.folder'})});
    const {id}=await folder.json();await db.doc(`driveConnections/${state.uid}`).set({refreshToken:tokens.refresh_token,folderId:id,connectedAt:new Date().toISOString()});
    res.send('Google Drive connected. Return to Plus Ultra Tutoring and refresh Settings. New attachments will be saved in your Plus Ultra Tutoring Attachments folder.');
  }catch(error){res.status(400).send(error.message||'Could not connect Drive. Start again from Settings.');}
});
