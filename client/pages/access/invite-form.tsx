import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { z } from 'zod';
import { $t, useNocoReachLocale } from '#i18n';
import { RouteDialog } from '#components/route-dialog';
import { useRouteOverlay } from '#components/use-route-overlay';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { ListSkeleton } from '#components/reach/states';
import { toast } from '#lib/toast';
import {
  MAX_INVITATIONS,
  parseEmails,
  type AccessCatalogue,
  type InvitationResult,
} from '../../../shared/member-access.js';
import { accessReasonMessage, useAccessApi, useAccessQuery } from './api';
import { AccessError } from './components';
import { ProjectPicker } from './project-picker';

const email = z.email();

/** Invite several addresses at once into the member role and the chosen projects. */
export default function InviteForm() {
  useNocoReachLocale();
  const catalogue = useAccessQuery<AccessCatalogue>('/catalog');
  const busyRef = useRef(false);
  const [results, setResults] = useState<InvitationResult[]>();
  return (
    <RouteDialog
      title={$t('accessMembers.inviteMember')}
      description={$t('accessMembers.invitationHelp')}
      beforeClose={() => !busyRef.current}
    >
      {results ? (
        <Results results={results} />
      ) : catalogue.error ? (
        <AccessError
          error={catalogue.error}
          retry={() => void catalogue.refetch()}
        />
      ) : !catalogue.data ? (
        <ListSkeleton />
      ) : (
        <Form
          projects={catalogue.data.projects}
          busyRef={busyRef}
          onSent={setResults}
        />
      )}
    </RouteDialog>
  );
}

function Form({
  projects,
  busyRef,
  onSent,
}: {
  projects: AccessCatalogue['projects'];
  busyRef: { current: boolean };
  onSent: (results: InvitationResult[]) => void;
}) {
  const { close } = useRouteOverlay();
  const call = useAccessApi();
  const queries = useQueryClient();
  const [text, setText] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [emailError, setEmailError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const ref = useRef<HTMLFormElement>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const emails = parseEmails(text);
    const invalid = emails.filter((item) => !email.safeParse(item).success);
    const message = !emails.length
      ? $t('accessMembers.enterEmails')
      : invalid.length
        ? $t('accessMembers.invalidEmails', { 0: invalid.join(', ') })
        : emails.length > MAX_INVITATIONS
          ? $t('accessMembers.tooManyEmails', { 0: MAX_INVITATIONS })
          : '';
    setEmailError(message);
    if (message) {
      ref.current?.querySelector<HTMLElement>('[name=emails]')?.focus();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const sent = await call<InvitationResult[]>('/invitations', {
        emails,
        projectIds,
      });
      void queries.invalidateQueries({ queryKey: ['reach-access'] });
      const succeeded = sent.filter((item) => item.outcome !== 'failed');
      if (succeeded.length)
        toast.success(() =>
          $t('accessMembers.invitationsSent', { 0: succeeded.length }),
        );
      onSent(sent);
    } catch (failure) {
      setError(failure);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <form
      ref={ref}
      className='flex flex-col gap-6'
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <AccessError error={error} />
      <FieldGroup>
        <Field data-invalid={!!emailError}>
          <FieldLabel htmlFor='invite-emails'>
            {$t('accessMembers.email')}
          </FieldLabel>
          <Textarea
            id='invite-emails'
            name='emails'
            rows={4}
            autoFocus
            autoComplete='off'
            placeholder={'alice@example.com\nbob@example.com'}
            value={text}
            disabled={busy}
            aria-invalid={!!emailError}
            onChange={(event) => {
              setText(event.target.value);
              setEmailError('');
            }}
          />
          {emailError ? (
            <FieldError>{emailError}</FieldError>
          ) : (
            <FieldDescription>
              {$t('accessMembers.emailsHint', { 0: MAX_INVITATIONS })}
            </FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor='invite-projects'>
            {$t('accessMembers.joinProjects')}
          </FieldLabel>
          <ProjectPicker
            id='invite-projects'
            projects={projects}
            value={projectIds}
            onChange={setProjectIds}
            disabled={busy}
          />
          <FieldDescription>
            {$t('accessMembers.joinProjectsHint')}
          </FieldDescription>
        </Field>
      </FieldGroup>
      <div className='sticky bottom-0 flex flex-wrap justify-end gap-2 bg-background py-2'>
        <Button variant='outline' disabled={busy} onClick={() => void close()}>
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {$t(busy ? 'accessMembers.sending' : 'accessMembers.sendInvitations')}
        </Button>
      </div>
    </form>
  );
}

/** One row per address; a link is shown once so it can be shared when mail is not delivered. */
function Results({ results }: { results: InvitationResult[] }) {
  const { close } = useRouteOverlay();
  return (
    <div className='flex flex-col gap-4'>
      <ul
        className='flex flex-col gap-3'
        aria-label={$t('accessMembers.invitationResults')}
      >
        {results.map((result) => (
          <li key={result.email} className='flex flex-col gap-2'>
            <div className='flex items-center justify-between gap-3'>
              <span className='min-w-0 truncate text-sm' title={result.email}>
                {result.email}
              </span>
              <Badge
                variant={
                  result.outcome === 'failed'
                    ? 'destructive'
                    : result.outcome === 'invited' && !result.emailSent
                      ? 'outline'
                      : 'secondary'
                }
              >
                {result.outcome === 'invited'
                  ? $t(
                      result.emailSent
                        ? 'accessMembers.outcomes.sent'
                        : 'accessMembers.outcomes.notSent',
                    )
                  : $t(`accessMembers.outcomes.${result.outcome}`)}
              </Badge>
            </div>
            {result.outcome === 'failed' ? (
              <span className='text-xs text-destructive'>
                {accessReasonMessage(result.reason)}
              </span>
            ) : null}
            {result.inviteUrl ? <CopyLink url={result.inviteUrl} /> : null}
          </li>
        ))}
      </ul>
      <div className='flex justify-end'>
        <Button onClick={() => void close()}>{$t('accessMembers.done')}</Button>
      </div>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className='flex gap-2'>
      <Input
        className='min-w-0 flex-1 font-mono text-xs'
        data-invitation-link
        readOnly
        aria-label={$t('accessMembers.invitationLink')}
        value={url}
      />
      <Button
        variant='outline'
        onClick={() => {
          void navigator.clipboard
            .writeText(url)
            .then(() => setCopied(true))
            .catch(() => toast.error(() => $t('accessMembers.copyFailed')));
        }}
      >
        {copied ? <Check /> : <Copy />}
        {$t(copied ? 'accessMembers.copied' : 'accessMembers.copy')}
      </Button>
    </div>
  );
}
