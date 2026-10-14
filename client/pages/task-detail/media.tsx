import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';
import { $t } from '#i18n';
import { Section } from '#components/reach/page';
import type { TaskMediaView } from '../../../shared/manual-task.js';

export function TaskMedia({projectId, taskId}: {projectId: number; taskId: string}) {
  const api = useApiClient();
  const [files, setFiles] = useState<TaskMediaView[]>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void api.request<{data:TaskMediaView[]}>({path:`nocoreachTasks/${encodeURIComponent(taskId)}/media`, query:{projectId:String(projectId)}, signal:controller.signal}).then(({data}) => {if (!controller.signal.aborted) setFiles(data);}, () => {if (!controller.signal.aborted) setFailed(true);});
    return () => controller.abort();
  }, [projectId, taskId, api]);
  if (failed) return <p role='alert'>{$t('manualTask.mediaLoadFailed')}</p>;
  if (!files.length) return null;
  return <Section title={$t('manualTask.attachments')}><ul className='space-y-4'>{files.map((file) => <li key={file.id} className='space-y-2'>
    <p className='break-all text-sm'>{file.filename}</p>
    {file.mimeType.startsWith('video/') ? <video controls preload='metadata' className='max-h-80 w-full rounded-lg' src={file.contentUrl}/> : <img alt={file.filename} loading='lazy' className='max-h-80 max-w-full rounded-lg object-contain' src={file.contentUrl}/>}
    <a className='text-sm underline' href={file.contentUrl} target='_blank' rel='noreferrer'>{$t('manualTask.openFile')}</a>
  </li>)}</ul></Section>;
}
