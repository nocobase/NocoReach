import { Link } from 'react-router';
import { $t } from '#i18n';
import { Tag } from '#components/reach/tag';
import { DetailDrawer } from '../detail-drawer';
import { PlaybookSteps } from '../playbook-steps';
import { categoryName, type Playbook } from '../playbook-model';

// View steps on the start card: what the chosen playbook has the Agent do and you check, over the task page so the
// start choices stay as they are. Playbooks holds the full page and the editor.
export function PlaybookDrawer({
  playbook,
  open,
  onClose,
}: {
  playbook?: Playbook;
  open: boolean;
  onClose: () => void;
}) {
  if (!playbook) return null;
  return (
    <DetailDrawer
      open={open}
      onClose={onClose}
      title={playbook.name}
      description={playbook.description || ''}
      footer={
        <Link
          className='nr-link text-sm'
          to={`/playbooks?id=${encodeURIComponent(playbook.id)}`}
        >
          {$t('taskDetail.openPlaybookPage')}
        </Link>
      }
    >
      <div className='flex flex-col gap-2'>
        {playbook.category && (
          <Tag tone='grey' className='self-start'>
            {categoryName(playbook.category)}
          </Tag>
        )}
        <PlaybookSteps steps={playbook.steps || []} />
      </div>
    </DetailDrawer>
  );
}
