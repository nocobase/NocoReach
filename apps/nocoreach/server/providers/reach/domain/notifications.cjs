'use strict';
const {randomUUID}=require('node:crypto');
// 通知 (2026-10-08 user decision): NocoBase's own notifications. Everyone gets an in-app message — the bell in
// NocoReach's header (and NocoBase's own inbox) — and the same by email once an admin has set up an email channel in
// NocoBase (通知管理). Only the people concerned are told: a task's owner when it waits for them, when they become its
// owner and when someone else leaves a message on it; the admins when the day's analysis finally failed. Notifying never
// holds up the work it reports: a failure is logged and forgotten.
const IN_APP='inbox',PORTAL='';
const nameOf=u=>String(u?.nickname||u?.username||u?.email||u?.id||'');
const taskNoOf=task=>task?.evidence?.no?`T-${task.evidence.no}`:'';
class Notifications{
 constructor(p){this.p=p;}
 repo(name){return this.p.store.repository(name);}
 async send(userIds,{title,content,url}){
  const ids=[...new Set(userIds.filter(Boolean).map(String))];if(!ids.length)return 0;
  try{
   const messages={inbox:{to:ids,title,body:content,...(url?{target:{type:'route',path:url}}:{})}};
   const channels=Object.entries(this.p.notificationChannels?.()||{}).filter(([,channel])=>channel.enabled!==false&&['smtp','resend'].includes(channel.provider));
   if(channels.length){
    const users=await Promise.all(ids.map(id=>this.p.users.get(id).catch(()=>null)));
    const emails=[...new Set(users.map(user=>user?.email).filter(email=>typeof email==='string'&&email.includes('@')))];
    if(emails.length)for(const [name]of channels)messages[name]={to:emails,subject:title,text:content};
   }
   await this.p.notification.send({idempotencyKey:randomUUID(),source:{type:'nocoreach'},messages});return ids.length;
  }
  catch{this.p.logger.warn('NocoReach notification delivery failed');return 0;}
 }
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
