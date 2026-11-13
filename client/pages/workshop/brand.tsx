import { useState } from 'react';
import { Link, useOutletContext } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { useBusinessAccess } from '#hooks/use-business-access';
import { toast } from '#lib/toast';
import { COMMUNITY_SECTIONS_MAX } from '../../../shared/repurpose.js';
import { useProject } from '../reach-data.js';
import type { WorkshopOutlet } from './index.js';
import {
  errorText,
  workshopRequest,
  type Brand,
  type WorkshopView,
} from './model.js';

type Fields = { name: string; url: string; sections: string };

/**
 * Brand and templates (PR 1 of Content workshop): the project's own community, its sections the destinations a
 * community post can go to, and the voice adaptations are written in, which lives in Memory and is changed there.
 */
export default function WorkshopBrand() {
  useNocoReachLocale();
  const { project } = useProject();
  const { view, reload } = useOutletContext<WorkshopOutlet>();
  return (
    <RouteDialog
      title={$t('workshop.brandKit')}
      description={$t('workshop.brandKitHint')}
      closeTo='/workshop'
      footer={null}
    >
      {project && view ? (
        <BrandForm
          key={view.brand.revision}
          projectId={String(project.id)}
          view={view}
          onSaved={reload}
        />
      ) : (
        <ListSkeleton rows={4} />
      )}
    </RouteDialog>
  );
}

const sectionsOf = (text: string) => [
  ...new Set(
    text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  ),
];

function BrandForm({
  projectId,
  view,
  onSaved,
}: {
  projectId: string;
  view: WorkshopView;
  onSaved: () => void;
}) {
  const { close } = useRouteOverlay();
  const { can } = useBusinessAccess('nrWorkshop.saveBrand', projectId);
  const c = view.brand.community;
  const [fields, setFields] = useState<Fields>({
    name: c?.name || '',
    url: c?.url || '',
    sections: (c?.sections || []).join('\n'),
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const sections = sectionsOf(fields.sections);
  const empty = !fields.name.trim() && !fields.url.trim() && !sections.length;
  const problem = empty
    ? ''
    : !fields.name.trim() || !fields.url.trim() || !sections.length
      ? $t('workshop.communityIncomplete')
      : sections.length > COMMUNITY_SECTIONS_MAX
        ? $t('workshop.sectionsMax', { 0: COMMUNITY_SECTIONS_MAX })
        : '';
  const save = async () => {
    setBusy(true);
    setFailure('');
    try {
      await workshopRequest<Brand>('saveBrand', projectId, {
        revision: view.brand.revision,
        community: empty
          ? null
          : { name: fields.name.trim(), url: fields.url.trim(), sections },
      });
      toast.success(() => $t('workshop.brandSaved'));
      onSaved();
      await close();
    } catch (e) {
      setFailure(errorText(e, $t('common.saveFailed')));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className='space-y-5'
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset className='space-y-3' disabled={!can || busy}>
        <legend className='text-sm font-semibold'>
          {$t('workshop.ownCommunity')}
        </legend>
        <p className='text-sm text-muted-foreground'>
          {$t('workshop.ownCommunityHint')}
        </p>
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='brand-community-name'>
              {$t('workshop.communityName')}
            </Label>
            <Input
              id='brand-community-name'
              maxLength={60}
              value={fields.name}
              onChange={(e) => setFields({ ...fields, name: e.target.value })}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='brand-community-url'>
              {$t('workshop.communityUrl')}
            </Label>
            <Input
              id='brand-community-url'
              type='url'
              placeholder='https://'
              value={fields.url}
              onChange={(e) => setFields({ ...fields, url: e.target.value })}
            />
          </div>
        </div>
        <div className='space-y-1.5'>
          <Label htmlFor='brand-community-sections'>
            {$t('workshop.communitySections')}
          </Label>
          <Textarea
            id='brand-community-sections'
            rows={4}
            placeholder={$t('workshop.communitySectionsHint', {
              0: COMMUNITY_SECTIONS_MAX,
            })}
            value={fields.sections}
            onChange={(e) =>
              setFields({ ...fields, sections: e.target.value })
            }
          />
        </div>
      </fieldset>
      <div className='space-y-1.5 border-t pt-4'>
        <div className='flex items-center justify-between gap-3'>
          <h3 className='text-sm font-semibold'>{$t('workshop.voice')}</h3>
          <Link className='nr-link text-sm' to='/project/memory'>
            {$t('workshop.voiceEdit')}
          </Link>
        </div>
        <p className='line-clamp-3 text-sm whitespace-pre-line text-muted-foreground'>
          {view.voice.trim() || $t('workshop.voiceEmpty')}
        </p>
      </div>
      {problem || failure ? (
        <p className='text-sm text-destructive' role='alert'>
          {failure || problem}
        </p>
      ) : null}
      <div className='flex justify-end gap-2 border-t pt-4'>
        <Button type='button' variant='ghost' onClick={() => void close()}>
          {$t('common.cancel')}
        </Button>
        <Button
          type='submit'
          disabled={!can || busy || Boolean(problem)}
          title={can ? undefined : $t('workshop.noBrandAccess')}
        >
          {$t('common.save')}
        </Button>
      </div>
    </form>
  );
}
