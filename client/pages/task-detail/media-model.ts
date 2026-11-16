import { $t } from '#i18n';
import type { AttachmentLabels } from '#components/attachment-list';
import type { TaskMediaView } from '../../../shared/manual-task.js';

// What a task's attachments show as (media.tsx), shared with the documents sent with a message (task-images.tsx).

// The list's wording, with `{name}` kept for the list to fill in.
export function documentLabels(): AttachmentLabels {
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

// The preview dialog's record of a task file.
export const previewFile = (
  file: Pick<TaskMediaView, 'id' | 'filename' | 'size' | 'contentUrl'> & {
    mimeType: string;
  },
) => ({
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
});
