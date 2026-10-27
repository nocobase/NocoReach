import { useApiClient } from '@nocobase/app-client';
import { useEffect, useState } from 'react';
import { $t, getCurrentLocale } from '#i18n';
import { Section } from '#components/reach/page';
import { Button } from '#components/ui/button';
import {
  AttachmentList,
  type AttachmentLabels,
} from '#components/attachment-list';
import { FilePreviewDialog } from '#extensions/nocobase-file-component-ui/index';
import {
  isTaskDocument,
  type TaskMediaView,
} from '../../../shared/manual-task.js';

// The list's wording, with `{name}` kept for the list to fill in.
function documentLabels(): AttachmentLabels {
  const named = (key: string) => $t(key, { 0: '{name}' });
  return {
    title: $t('manualTask.attachments'),
    images: $t('manualTask.attachments'),
    files: $t('manualTask.documents'),
    pending: $t('manualTask.documents'),
    upload: $t('manualTask.upload'),
    preview: named('manualTask.previewFile'),
    download: named('manualTask.downloadFile'),
    remove: $t('common.remove'),
    uploading: $t('manualTask.uploading'),
    removeTitle: $t('common.remove'),
    removeDescription: '',
    removeConfirm: $t('common.remove'),
    cancel: $t('common.cancel'),
    previous: $t('tablePagination.previous'),
    next: $t('tablePagination.next'),
  };
}

export function TaskMedia({
  projectId,
  taskId,
}: {
  projectId: number;
  taskId: string;
}) {
  const api = useApiClient();
  const scope = `${projectId}:${taskId}`;
  const [result, setResult] = useState<{
    scope: string;
    files: TaskMediaView[];
    failed: boolean;
  }>();
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api
      .request<{ data: TaskMediaView[] }>({
        path: `nocoreachTasks/${encodeURIComponent(taskId)}/media`,
        query: { projectId: String(projectId) },
        signal: controller.signal,
      })
      .then(
        ({ data }) => {
          if (!controller.signal.aborted)
            setResult({ scope, files: data, failed: false });
        },
        () => {
          if (!controller.signal.aborted)
            setResult({ scope, files: [], failed: true });
        },
      );
    return () => controller.abort();
  }, [projectId, taskId, scope, api, retry]);
  if (!result || result.scope !== scope) return null;
  if (result.failed)
    return (
      <div>
        <p role='alert'>{$t('manualTask.mediaLoadFailed')}</p>
        <Button
          variant='outline'
          onClick={() => {
            setResult(undefined);
            setRetry((value) => value + 1);
          }}
        >
          {$t('common.retry')}
        </Button>
      </div>
    );
  const files = result.files;
  if (!files.length) return null;
  // Documents are chips that preview (Word, Excel, PDF and text render locally) or download; media show in place.
  const documents = files.filter((file) => isTaskDocument(file.mimeType));
  const media = files.filter((file) => !isTaskDocument(file.mimeType));
  return (
    <Section title={$t('manualTask.attachments')}>
      {documents.length > 0 && (
        <>
          <AttachmentList
            className='mb-4'
            locale={getCurrentLocale()}
            labels={documentLabels()}
            files={documents.map((file) => ({
              id: file.id,
              name: file.filename,
              size: file.size,
              url: file.contentUrl,
              downloadUrl: file.contentUrl,
              image: false,
            }))}
            onPreview={(_, index) => setPreview(index)}
          />
          <FilePreviewDialog
            open={preview !== null}
            initialIndex={preview ?? 0}
            onOpenChange={(open) => {
              if (!open) setPreview(null);
            }}
            labels={{ download: $t('manualTask.download') }}
            files={documents.map((file) => ({
              id: file.id,
              disk: 'local',
              key: file.id,
              filename: file.filename,
              ext: file.filename.includes('.')
                ? file.filename.slice(file.filename.lastIndexOf('.') + 1)
                : '',
              mimeType: file.mimeType,
              size: file.size,
              createdAt: '',
              updatedAt: '',
              contentUrl: file.contentUrl,
            }))}
          />
        </>
      )}
      <ul className='space-y-4'>
        {media.map((file) => (
          <li key={file.id} className='space-y-2'>
            <p className='break-all text-sm'>{file.filename}</p>
            {file.mimeType.startsWith('video/') ? (
              <video
                controls
                preload='metadata'
                className='max-h-80 w-full rounded-lg'
                src={file.contentUrl}
              />
            ) : (
              <img
                alt={file.filename}
                loading='lazy'
                className='max-h-80 max-w-full rounded-lg object-contain'
                src={file.contentUrl}
              />
            )}
            <a
              className='nr-link text-sm'
              href={file.contentUrl}
              target='_blank'
              rel='noreferrer'
            >
              {$t('manualTask.openFile')}
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
