import { useMessageState, $t } from '#i18n';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { PageContainer } from '#components/reach/page';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useProject } from './reach-data';
import { TaskDetail } from './task-detail';
import type { TaskData as Data } from './task-execution-types';
const call = <T,>(projectId: number, taskId: string, action: string) => api.action<T>('nrTaskWork', action, {method: 'POST', body: {projectId: String(projectId), taskId}, unwrap: 'data'});
export default function TaskPage(){const {project,error}=useProject(),{taskId=''}=useParams();const [first,setFirst]=useState<Data|null>(),[loadError,setLoadError]=useMessageState('');
 useEffect(()=>{if(!project)return;setFirst(undefined);setLoadError('');void call<Data>(project.id,taskId,'get').then(setFirst).catch(()=>setLoadError(() => ($t("读取任务失败，请刷新重试。"))));},[project?.id,taskId]);
 if(!project||(!first&&!loadError))return <PageContainer className="nr-page"><p role="status">{error||$t("正在读取任务…")}</p></PageContainer>;
 if(loadError||!first)return <PageContainer className="nr-page"><p role="alert" className="nr-error">{loadError}</p></PageContainer>;
 return <TaskDetail key={taskId} projectId={project.id} taskId={taskId} initial={first}/>;}
