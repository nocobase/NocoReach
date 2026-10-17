import type { ReactNode } from 'react';
import { GitMerge, GitPullRequest, Undo2 } from 'lucide-react';
import { $t, $tj } from '#i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#components/ui/tabs';
import { ChangeView } from '../change-view.js';
import type {
  PullRequestInfo,
  Run,
  TaskData,
} from '../task-execution-types.js';
import type { Stage } from '../playbook-model.js';
import { TaskExecutionPanel } from './execution-panel.js';
import { useTechnicalDetails, type TechnicalTab } from './technical-state.js';

export function PrCard({ pr }: { pr: PullRequestInfo }) {
  const add = pr.files.reduce((n, f) => n + f.additions, 0),
    del = pr.files.reduce((n, f) => n + f.deletions, 0);
  return (
    <div className='flex flex-col gap-3 rounded-lg border p-4 text-sm'>
      <div className='flex flex-wrap items-center gap-2'>
        <GitPullRequest
          className='size-4 text-muted-foreground'
          aria-hidden='true'
        />
        <a className='nr-link' href={pr.url} target='_blank' rel='noreferrer'>
          {$t('taskDetail.viewChangesGithub')}
        </a>
        <code className='text-muted-foreground'>#{pr.number}</code>
      </div>
      <dl className='grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[6rem_1fr]'>
        <dt className='text-muted-foreground'>{$t('taskDetail.changes')}</dt>
        <dd>
          <span className='nr-add'>+{add}</span>{' '}
          <span className='nr-del'>−{del}</span>{' '}
          {$tj('taskDetail.files', { 0: pr.files.length })}
        </dd>
        <dt className='text-muted-foreground'>{$t('taskDetail.branch')}</dt>
        <dd className='break-all'>
          <code>{pr.branch}</code>
          {pr.headSha ? ` · ${pr.headSha.slice(0, 7)}` : ''}
        </dd>
        {pr.checks ? (
          <>
            <dt className='text-muted-foreground'>{$t('common.check')}</dt>
            <dd
              className={
                pr.checks.ok
                  ? 'whitespace-pre-wrap'
                  : 'whitespace-pre-wrap text-destructive'
              }
            >
              {pr.checks.summary}
            </dd>
          </>
        ) : null}
        {pr.outOfScope?.length ? (
          <>
            <dt className='text-muted-foreground'>
              {$t('taskDetail.outsideScope')}
            </dt>
            <dd className='break-all text-destructive'>
              {pr.outOfScope.join('、')}
            </dd>
          </>
        ) : null}
      </dl>
      <ul className='flex flex-col gap-1 text-xs'>
        {pr.files.map((f) => (
          <li key={f.path} className='flex justify-between gap-3'>
            <code className='break-all'>{f.path}</code>
            <span className='shrink-0 text-muted-foreground'>
              +{f.additions} −{f.deletions}
            </span>
          </li>
        ))}
      </ul>
      {pr.changes?.length ? <ChangeView changes={pr.changes} /> : null}
    </div>
  );
}

/** For engineers: the pull requests behind a page change and every Agent run, kept out of the owner's way. */
export function TechnicalDetails({
  data,
  projectId,
  taskId,
  runs,
}: {
  data: TaskData;
  projectId: number;
  taskId: string;
  runs: Run[];
}) {
  const { tab, open, close } = useTechnicalDetails();
  const w = data.work,
    stages: Stage[] = w.flow?.stages || [];
  const results = stages
    .map((stage, index) => ({ stage, artifact: w.results[index] }))
    .filter(({ artifact }) => artifact?.pr) as {
    stage: Stage;
    artifact: NonNullable<TaskData['work']['results'][number]>;
  }[];
  const links = [
    w.release?.pr && {
      icon: <GitMerge />,
      text: `PR #${w.release.pr.number}${w.release.mergeSha ? ` · ${w.release.mergeSha.slice(0, 7)}` : ''}`,
      url: w.release.pr.url,
    },
    w.revert?.url && {
      icon: <Undo2 />,
      text: $t('taskDetail.revertPr', { 0: w.revert.number }),
      url: w.revert.url,
    },
  ].filter(Boolean) as { icon: ReactNode; text: string; url: string }[];
  return (
    <Dialog
      open={tab !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>{$t('taskDetail.technicalDetails')}</DialogTitle>
          <DialogDescription>
            {$t('taskDetail.technicalDetailsHint')}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={tab || 'result'}
          onValueChange={(value) => open(value as TechnicalTab)}
          className='min-h-0 flex-1'
        >
          <TabsList variant='line'>
            <TabsTrigger value='result'>
              {$t('taskDetail.codeChanges')}
            </TabsTrigger>
            <TabsTrigger value='runs'>{$t('common.runHistory')}</TabsTrigger>
          </TabsList>
          <TabsContent
            value='result'
            className='-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pt-3'
          >
            {links.map((link) => (
              <a
                key={link.url}
                className='nr-link inline-flex items-center gap-2 self-start text-sm [&_svg]:size-4'
                href={link.url}
                target='_blank'
                rel='noreferrer'
              >
                {link.icon}
                {link.text}
              </a>
            ))}
            {results.length ? (
              results.map(({ stage, artifact }) => (
                <section key={stage.key} className='flex flex-col gap-2'>
                  <h3 className='text-sm font-medium'>
                    {stage.name} ·{' '}
                    {$t('taskDetail.versionNumber', { 0: artifact.version })}
                  </h3>
                  <PrCard pr={artifact.pr!} />
                </section>
              ))
            ) : links.length ? null : (
              <p className='text-sm text-muted-foreground'>
                {$t('taskDetail.noCodeChanges')}
              </p>
            )}
          </TabsContent>
          <TabsContent
            value='runs'
            className='-mx-4 min-h-0 overflow-y-auto px-4 pt-3'
          >
            <TaskExecutionPanel
              projectId={projectId}
              taskId={taskId}
              runs={runs}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
