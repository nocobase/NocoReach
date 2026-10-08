'use strict';
// 通知 (2026-10-08 user decision): NocoBase's own notifications. Everyone gets an in-app message — the bell in
// NocoReach's header (and NocoBase's own inbox) — and the same by email once an admin has set up an email channel in
// NocoBase (通知管理). Only the people concerned are told: a task's owner when it waits for them, when they become its
// owner and when someone else leaves a message on it; the admins when the day's analysis finally failed. Notifying never
// holds up the work it reports: a failure is logged and forgotten.
const IN_APP='nocoreach',PORTAL='/x/main';
const nameOf=u=>String(u?.nickname||u?.username||u?.email||u?.id||'');
const taskNoOf=task=>task?.evidence?.no?`T-${task.evidence.no}`:'';
class Notifications{
 constructor(p){this.p=p;this.ready=null;}
 manager(){return this.p.app?.pm?.get?.('notification-manager')||this.p.app?.pm?.get?.('@nocobase/plugin-notification-manager')||null;}
 repo(name){return this.p.db.getRepository(name);}
 warn(message,e){this.p.app?.logger?.warn?.(message,{message:e?.message});}
 // NocoReach's own in-app channel, made once.
 async channel(){const repo=this.repo('notificationChannels');if(!repo)return false;
  if(!await repo.findOne({filter:{name:IN_APP}}))await repo.create({values:{name:IN_APP,title:'NocoReach',notificationType:'in-app-message',options:{},description:'NocoReach 的任务和分析提醒'}});return true;}
 async emailChannel(){const row=await this.repo('notificationChannels')?.findOne({filter:{notificationType:'email'},sort:['id']});return row?.get?row.get('name'):row?.name||null;}
 // One message to some people: in the app, and by email when there is an email channel. Returns how many were told.
 async send(userIds,{title,content,url}){
  try{const ids=[...new Set((userIds||[]).filter(x=>x!=null&&x!=='').map(Number))].filter(Number.isSafeInteger),m=this.manager();if(!ids.length||!m)return 0;
   if(!this.ready)this.ready=this.channel().catch(e=>{this.ready=null;throw e;});await this.ready;
   const receivers={type:'userId',value:ids};
   await m.send({channelName:IN_APP,triggerFrom:'nocoreach',message:{title,content,options:url?{url:`${PORTAL}${url}`}:{}},receivers});
   const email=await this.emailChannel().catch(()=>null);
   if(email)await m.send({channelName:email,triggerFrom:'nocoreach',message:{subject:`NocoReach：${title}`,contentType:'text',text:`${content}\n\n在 NocoReach 里查看：${PORTAL}${url||'/home'}`},receivers}).catch(e=>this.warn('NocoReach email notification failed',e));
   return ids.length;
  }catch(e){this.warn('NocoReach notification failed',e);return 0;}}
 async userName(id){try{return nameOf((await this.repo('users').findOne({filterByTk:id}))?.toJSON?.()||{id});}catch{return String(id);}}
 // What happened on a task, worked out by the task service when it saved: it now waits for its owner (step), it has a
 // new owner (by), someone else left a message (by, comment).
 async taskEvents(task,w,events){
  const no=taskNoOf(task),label=no||task.title,url=`/actions/${task.id}`,owner=w.humanOwnerId;if(!owner)return 0;let told=0;
  for(const e of events){
   if(e.kind==='waiting')told+=await this.send([owner],{title:`${label} 等你${e.step}`,content:task.title,url});
   else if(e.kind==='owner')told+=await this.send([owner],{title:`你是 ${label} 的负责人了`,content:e.by?`${task.title}（${await this.userName(e.by)} 指定）`:task.title,url});
   else if(e.kind==='comment')told+=await this.send([owner],{title:`${await this.userName(e.by)} 在 ${label} 留言`,content:String(e.comment||'').slice(0,300),url});
  }
  return told;}
 // The day's analysis failed after its automatic tries: the admins hear it.
 async analysisFailed(projectId,error){
  const admins=(await this.p.members?.list?.().catch(()=>[])||[]).filter(u=>u.role==='admin').map(u=>u.id);
  let project='';try{project=(await this.p.project(String(projectId)))?.name||'';}catch{/* the message still says what failed */}
  return this.send(admins,{title:'今天的每日分析没有完成',content:`${project?`${project}：`:''}${error}。可以在洞察页点“重新分析”。`,url:'/home'});}
}
module.exports={Notifications,IN_APP,PORTAL};
