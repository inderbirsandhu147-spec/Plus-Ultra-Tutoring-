const fields={
  assignments:['title','subject','dueDate','instructions','link','kind','feedback','score'],
  assessments:['title','date','score'],
  sessions:['subject','topic','date','time','duration'],
  notes:['date','text']
};
export function editableChanges(collection,changes) {
  if(!fields[collection] || Object.keys(changes).some(k=>!fields[collection].includes(k)))throw new Error('These fields cannot be edited.');
  const result={...changes};
  for(const [k,v] of Object.entries(result)) {
    if(['score','duration'].includes(k)) {
      if(k==='score'&&v===null)continue;
      if(typeof v!=='number'||!Number.isFinite(v)||v<(k==='score'?0:10)||v>(k==='score'?100:240))throw new Error(k==='score'?'Score must be between 0 and 100.':'Duration must be between 10 and 240 minutes.');
    } else {
      if(typeof v!=='string')throw new Error('Invalid text value.');
      if(['title','subject','instructions','text','topic'].includes(k)&&!v.trim())throw new Error('Please complete all required fields.');
      const limits={title:160,subject:80,instructions:10000,feedback:10000,text:10000,topic:200,link:2000};
      if(limits[k]&&v.length>limits[k])throw new Error('This text is too long.');
      if(['date','dueDate'].includes(k)&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T12:00:00'))))throw new Error('Choose a valid date.');
      if(k==='time'&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new Error('Choose a valid time.');
      if(k==='kind'&&!['simple','response'].includes(v))throw new Error('Choose a valid task type.');
      if(k==='link'&&v) {let url;try{url=new URL(v);}catch{throw new Error('Use a complete http or https link.');}if(!['https:','http:'].includes(url.protocol))throw new Error('Use a complete http or https link.');}
    }
  }
  return result;
}
export function replaceGoal(goals,id,changes) {
  const progress=Number(changes.progress),title=String(changes.title||'').trim();
  if(!title||title.length>200||!Number.isFinite(progress)||progress<0||progress>100)throw new Error('Add a goal title and progress from 0 to 100.');
  if(!goals.some(g=>g.id===id))throw new Error('This goal no longer exists. Refresh and try again.');
  return goals.map(g=>g.id===id?{...g,title,progress}:g);
}
