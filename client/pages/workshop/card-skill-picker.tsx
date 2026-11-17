import { useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink } from 'lucide-react';
import { $t } from '#i18n';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { cn } from '#lib/utils';
import type { CardSkill } from './model.js';

// Draw with a Skill (2026-11-17 user decision; mockup xhs-card-styles.html frame 4): an Agent Skill that makes the card
// images itself, instead of the template. Two are offered whether or not the project has them: guizang-social-card-skill
// (AGPL-3.0, so NocoReach neither bundles nor copies it; people add it from its own repository) and baoyu-xhs-images
// (MIT); and every Skill on the Skills page whose description says it draws card images. Only an added one can be
// chosen. Cards a Skill drew are changed through Request changes, as only the Skill can draw them again.

const KNOWN: Record<string, { about: () => string; repo: string }> = {
  'guizang-social-card-skill': {
    about: () => $t('workshop.skillGuizang'),
    repo: 'https://github.com/op7418/guizang-social-card-skill',
  },
  'baoyu-xhs-images': {
    about: () => $t('workshop.skillBaoyu'),
    repo: 'https://github.com/JimLiu/baoyu-skills/tree/main/skills/baoyu-xhs-images',
  },
};

export function CardSkillPicker({
  skills,
  current,
  onClose,
  onPick,
  onDrop,
}: {
  skills: CardSkill[];
  /** The Skill the brand kit draws with now, if any. */
  current: string | null;
  onClose: () => void;
  onPick: (skill: string) => void;
  /** Back to the card styles: the one chosen in the picker. */
  onDrop: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(
    current ?? skills.find((s) => s.added)?.name ?? null,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-[680px]'>
        <DialogHeader>
          <DialogTitle>{$t('workshop.drawWithSkill')}</DialogTitle>
          <DialogDescription>
            {$t('workshop.skillPickerHint')}
          </DialogDescription>
        </DialogHeader>
        <div
          role='radiogroup'
          aria-label={$t('workshop.drawWithSkill')}
          className='space-y-2'
        >
          {skills.map((s) => {
            const known = KNOWN[s.name];
            return (
              <div
                key={s.name}
                className={cn(
                  'flex gap-3 rounded-lg border p-3',
                  chosen === s.name && 'border-primary ring-1 ring-primary',
                  !s.added && 'bg-muted/40',
                )}
              >
                <input
                  type='radio'
                  name='card-skill'
                  id={`card-skill-${s.name}`}
                  className='mt-1 size-4 accent-primary'
                  checked={chosen === s.name}
                  disabled={!s.added}
                  onChange={() => setChosen(s.name)}
                />
                <div className='min-w-0 flex-1 space-y-1'>
                  <label
                    htmlFor={`card-skill-${s.name}`}
                    className='flex flex-wrap items-center gap-2 text-sm font-medium'
                  >
                    <span className='font-mono'>{s.name}</span>
                    {s.added ? (
                      <Tag tone='green'>{$t('workshop.skillAdded')}</Tag>
                    ) : (
                      <Tag tone='grey'>{$t('workshop.skillNotAdded')}</Tag>
                    )}
                  </label>
                  <p className='text-sm text-muted-foreground'>
                    {known ? known.about() : s.description}
                  </p>
                  {known || !s.added ? (
                    <p className='flex flex-wrap gap-x-3 text-sm'>
                      {known ? (
                        <a
                          className='nr-link inline-flex items-center gap-1'
                          href={known.repo}
                          target='_blank'
                          rel='noreferrer'
                        >
                          {$t('workshop.skillRepo')}
                          <ExternalLink
                            className='size-3.5'
                            aria-hidden='true'
                          />
                        </a>
                      ) : null}
                      {s.added ? null : (
                        <Link className='nr-link' to='/skills'>
                          {$t('workshop.skillAddOnSkills')}
                        </Link>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        <div className='space-y-1 rounded-lg bg-muted/50 p-3 text-sm'>
          <p className='font-medium'>{$t('workshop.skillAfter')}</p>
          <ul className='list-disc space-y-0.5 pl-5 text-muted-foreground'>
            <li>{$t('workshop.skillAfterEdit')}</li>
            <li>{$t('workshop.skillAfterBrand')}</li>
            <li>{$t('workshop.skillAfterChecks')}</li>
          </ul>
        </div>
        <DialogFooter className='items-center sm:justify-between'>
          {current ? (
            <Button
              type='button'
              variant='link'
              className='px-0'
              onClick={onDrop}
            >
              {$t('workshop.skillDrop')}
            </Button>
          ) : (
            <span />
          )}
          <div className='flex gap-2'>
            <Button type='button' variant='ghost' onClick={onClose}>
              {$t('common.cancel')}
            </Button>
            <Button
              type='button'
              disabled={!chosen}
              onClick={() => chosen && onPick(chosen)}
            >
              {$t('workshop.useSkill')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
