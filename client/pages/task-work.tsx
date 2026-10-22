import { useMessageState, $t } from '#i18n';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { PageContainer } from '#components/reach/page';
import { ListSkeleton } from '#components/reach/states';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useProject } from './reach-data';
import { TaskDetail } from './task-detail';
import type { TaskData as Data } from './task-execution-types';
const call = <T,>(projectId: number, taskId: string, action: string) => api.action<T>('nrTaskWork', action, {method: 'POST', body: {projectId: String(projectId), taskId}, unwrap: 'data'});
export default function TaskPage(){const {project,error}=useProject(),{taskId=''}=useParams();return project?<LoadedTask key={`${project.id}:${taskId}`} projectId={project.id} taskId={taskId}/>:<PageContainer className="nr-page"><p role="status">{error||$t('common.loadingTasks')}</p></PageContainer>;}
function LoadedTask({projectId,taskId}:{projectId:number;taskId:string}){const [first,setFirst]=useState<Data|null>(),[loadError,setLoadError]=useMessageState('');
 useEffect(()=>{let alive=true;void call<Data>(projectId,taskId,'get').then(data=>{if(alive)setFirst(data);}).catch(()=>{if(alive)setLoadError(() => ($t('taskWork.notLoadTaskRefreshRetry')));});return()=>{alive=false;};},[projectId,taskId]);
 if(!first&&!loadError)return <PageContainer className="nr-page"><ListSkeleton rows={6} label={$t('common.loadingTasks')}/></PageContainer>;
 if(loadError||!first)return <PageContainer className="nr-page"><p role="alert" className="nr-error">{loadError}</p></PageContainer>;
 return <TaskDetail key={taskId} projectId={projectId} taskId={taskId} initial={first}/>;}
