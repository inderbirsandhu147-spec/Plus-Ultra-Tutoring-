export const allowedMime=['application/pdf','image/jpeg','image/png','image/webp','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export function participant(user,task,isTutor) {
  return isTutor&&task.tutorId===user.uid || (user.email_verified===true||String(user.email||'').endsWith('@students.plusultra.app'))&&task.studentEmail===String(user.email||'').toLowerCase();
}
export function checkUpload(user,task,isTutor,purpose,mime,size) {
  if(!participant(user,task,isTutor))throw new Error('Access denied.');
  if(purpose==='resources') {if(!isTutor||task.tutorId!==user.uid)throw new Error('Tutor access required.');}
  else if(purpose==='submissions') {if(task.studentEmail!==String(user.email||'').toLowerCase()||task.status!=='assigned')throw new Error('This task cannot receive a submission.');}
  else throw new Error('Invalid upload purpose.');
  if(!allowedMime.includes(mime)||size<=0||size>10*1024*1024)throw new Error('Use an allowed file type up to 10 MB.');
}
