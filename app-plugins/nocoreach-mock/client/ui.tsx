import { useEffect, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import {
  MOCK_SCENARIOS,
  type MockScenario,
  type MockStatus,
} from '../server/types.js';
import { copy, type MockCopy } from './copy.js';
import type { MockClientHost } from './types.js';

type RequestError = { status?: number; message?: string };
const errorInfo = (value: unknown): RequestError =>
  value !== null && typeof value === 'object' ? value : {};
const validSeed = (value: string): boolean =>
  value.trim().length > 0 &&
  value.trim().length <= 128 &&
  /^[\p{L}\p{N}_.: -]+$/u.test(value.trim());
const validClock = (value: string): boolean =>
  z.iso.datetime({ offset: true }).safeParse(value).success;

/** Host-supplied UI primitives keep this package independent of application-owned source paths. */
export function createMockUi(host: MockClientHost) {
  const { Page, Card, Notice, Button, Input, Field, Select, Confirm, Loading } =
    host.components;
  const listeners = new Set<() => void>();
  const changed = () => listeners.forEach((fn) => fn());

  function ErrorNotice({
    error,
    c,
    retry,
    reload,
  }: {
    error: unknown;
    c: MockCopy;
    retry?: () => void;
    reload?: () => void;
  }) {
    const { status, message } = errorInfo(error);
    const title =
      status === 401
        ? c.expired
        : status === 403
          ? c.forbidden
          : status === 404
            ? c.missing
            : message === 'NR_MOCK_INVALID_SETTINGS'
              ? c.invalid
              : status === 409
                ? c.conflict
                : c.requestFailed;
    return (
      <Notice title={title} error>
        {status === 401 ? (
          <Button variant='outline' onClick={host.signIn}>
            {c.signIn}
          </Button>
        ) : status === 404 ? (
          <Button variant='outline' onClick={host.projectSettings}>
            {c.chooseProject}
          </Button>
        ) : status === 409 && reload ? (
          <div className='flex flex-col gap-2'>
            <p>{c.reloadHint}</p>
            <Button variant='outline' onClick={reload}>
              {c.reload}
            </Button>
          </div>
        ) : status !== 403 && status !== 404 && status !== 409 && retry ? (
          <Button variant='outline' onClick={retry}>
            {c.retry}
          </Button>
        ) : null}
      </Notice>
    );
  }

  function IndicatorBody({
    projectId,
    locale,
  }: {
    projectId: string;
    locale: string;
  }) {
    const c = copy(locale),
      [epoch, setEpoch] = useState(0);
    const [result, setResult] = useState<{
      data?: MockStatus;
      error?: unknown;
    }>({});
    useEffect(() => {
      const fn = () => setEpoch((v) => v + 1);
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    }, []);
    useEffect(() => {
      const controller = new AbortController();
      let active = true;
      void host.request('status', { projectId }, controller.signal).then(
        (data) => {
          if (active && data.projectId === projectId) setResult({ data });
          else if (active)
            setResult({ error: new Error('NR_MOCK_PROJECT_MISMATCH') });
        },
        (error: unknown) => {
          if (active) setResult({ error });
        },
      );
      return () => {
        active = false;
        controller.abort();
      };
    }, [projectId, epoch]);
    if (result.error)
      return (
        <host.components.StatusIcon
          label={c.unknown}
          description={c.retry}
          state='unknown'
          onRetry={() => setEpoch((v) => v + 1)}
        />
      );
    if (!result.data?.globalEnabled) return null;
    return (
      <host.components.StatusIcon
        label={c.indicator}
        description={
          result.data.enabled ? c.indicatorBody : c.indicatorDisabled
        }
        state={result.data.enabled ? 'enabled' : 'disabled'}
      />
    );
  }
  function MockIndicator() {
    const context = host.useContext();
    return context.role ? (
      <IndicatorBody
        key={context.scopeKey}
        projectId={context.projectId}
        locale={context.locale}
      />
    ) : null;
  }
  function SettingsContent({
    projectId,
    locale,
  }: {
    projectId: string;
    locale: string;
  }) {
    const c = copy(locale),
      [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<{
      attempt: number;
      data?: MockStatus;
      error?: unknown;
    }>({ attempt: -1 });
    useEffect(() => {
      const controller = new AbortController();
      let active = true;
      void host.request('status', { projectId }, controller.signal).then(
        (data) => {
          if (active && data.projectId === projectId)
            setResult({ attempt, data });
          else if (active)
            setResult({
              attempt,
              error: new Error('NR_MOCK_PROJECT_MISMATCH'),
            });
        },
        (error: unknown) => {
          if (active) setResult({ attempt, error });
        },
      );
      return () => {
        active = false;
        controller.abort();
      };
    }, [projectId, attempt]);
    if (result.attempt !== attempt) return <Loading label={c.loading} />;
    if (result.error)
      return (
        <ErrorNotice
          error={result.error}
          c={c}
          retry={() => setAttempt((v) => v + 1)}
        />
      );
    if (!result.data) return null;
    const status = result.data;
    return (
      <>
        {!status.globalEnabled ? (
          <Notice title={c.globalOff}>
            <p>{c.enableHelp}</p>
          </Notice>
        ) : null}
        <div className='flex flex-wrap gap-4 text-sm'>
          <span>
            {c.project}: {status.projectId}
          </span>
          <span>
            {c.environment}: {status.environment ?? c.disabled}
          </span>
        </div>
        {status.globalEnabled ? (
          <SettingsForm
            key={`${projectId}:${attempt}`}
            initial={status}
            c={c}
            reload={() => setAttempt((v) => v + 1)}
          />
        ) : null}
        {status.globalEnabled ? (
          <Card title={c.coverage} description={c.unsupported}>
            <ul className='flex flex-wrap gap-x-4 gap-y-2 text-sm'>
              {status.coverage.map((item) => (
                <li key={item}>
                  {c.targets[item as keyof typeof c.targets] ?? item}
                </li>
              ))}
            </ul>
            <h3 className='mt-4 text-sm font-medium'>{c.defaults}</h3>
            <dl className='mt-2 grid gap-2 text-sm'>
              {Object.entries(status.defaults).map(([label, target]) => (
                <div key={label} className='flex flex-wrap gap-x-2'>
                  <dt className='font-medium'>
                    {c.targets[label as keyof typeof c.targets] ?? label}
                  </dt>
                  <dd className='break-all'>{target}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ) : null}
      </>
    );
  }
  function SettingsForm({
    initial,
    c,
    reload,
  }: {
    initial: MockStatus;
    c: MockCopy;
    reload: () => void;
  }) {
    const [saved, setSaved] = useState(initial),
      [enabled, setEnabled] = useState(initial.enabled),
      [scenario, setScenario] = useState(initial.scenario),
      [seed, setSeed] = useState(initial.seed),
      [clock, setClock] = useState(initial.clock);
    const [busy, setBusy] = useState<'save' | 'reset' | null>(null),
      busyRef = useRef(false),
      alive = useRef(true);
    const [errors, setErrors] = useState<{ seed?: string; clock?: string }>({}),
      [submitted, setSubmitted] = useState(false),
      [error, setError] = useState<unknown>(null),
      [confirm, setConfirm] = useState(false),
      [success, setSuccess] = useState<'save' | 'reset' | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => {
      alive.current = true;
      return () => {
        alive.current = false;
        controller.current?.abort();
      };
    }, []);
    const apply = (next: MockStatus) => {
      setSaved(next);
      setEnabled(next.enabled);
      setScenario(next.scenario);
      setSeed(next.seed);
      setClock(next.clock);
    };
    async function submit(action: 'save' | 'reset') {
      if (busyRef.current) return;
      if (action === 'save') {
        setSubmitted(true);
        const next = {
          ...(validSeed(seed) ? {} : { seed: c.seedError }),
          ...(validClock(clock) ? {} : { clock: c.clockError }),
        };
        setErrors(next);
        if (next.seed || next.clock) {
          formRef.current
            ?.querySelector<HTMLInputElement>(
              next.seed ? '#mock-seed' : '#mock-clock',
            )
            ?.focus();
          return;
        }
      }
      busyRef.current = true;
      setBusy(action);
      setError(null);
      setSuccess(null);
      controller.current = new AbortController();
      try {
        const data = await host.request(
          action === 'save' ? 'configure' : 'reset',
          action === 'save'
            ? {
                projectId: initial.projectId,
                enabled,
                scenario,
                seed: seed.trim(),
                clock,
                revision: saved.revision,
              }
            : { projectId: initial.projectId, revision: saved.revision },
          controller.current.signal,
        );
        if (!alive.current) return;
        if (data.projectId !== initial.projectId)
          throw new Error('NR_MOCK_PROJECT_MISMATCH');
        apply(data);
        setErrors({});
        setSubmitted(false);
        setConfirm(false);
        setSuccess(action);
        host.notify(action === 'save' ? c.saved : c.resetDone);
        changed();
      } catch (failure) {
        if (alive.current) setError(failure);
      } finally {
        busyRef.current = false;
        if (alive.current) setBusy(null);
      }
    }
    const onSubmit = (event: FormEvent) => {
      event.preventDefault();
      void submit('save');
    };
    return (
      <Card title={c.cardTitle} description={c.cardDescription}>
        <form
          ref={formRef}
          onSubmit={onSubmit}
          noValidate
          className='flex flex-col gap-6'
        >
          {error && !confirm ? (
            <ErrorNotice
              error={error}
              c={c}
              reload={reload}
              retry={
                busy
                  ? undefined
                  : () => {
                      void submit('save');
                    }
              }
            />
          ) : null}
          {success ? (
            <p className='text-sm' role='status'>
              {success === 'save' ? c.saved : c.resetDone}
            </p>
          ) : null}
          <div className='grid gap-6 sm:grid-cols-2'>
            <Field label={c.availability} htmlFor='mock-enabled'>
              <Select
                id='mock-enabled'
                value={enabled ? 'enabled' : 'disabled'}
                onChange={(value) => setEnabled(value === 'enabled')}
                disabled={Boolean(busy)}
                items={[
                  { value: 'disabled', label: c.disabled },
                  { value: 'enabled', label: c.enabled },
                ]}
              />
            </Field>
            <Field label={c.scenario} htmlFor='mock-scenario'>
              <Select
                id='mock-scenario'
                value={scenario}
                onChange={(value) => {
                  if ((MOCK_SCENARIOS as readonly string[]).includes(value))
                    setScenario(value as MockScenario);
                }}
                disabled={Boolean(busy)}
                items={MOCK_SCENARIOS.map((value) => ({
                  value,
                  label: c.scenarios[value],
                }))}
              />
            </Field>
          </div>
          <Field
            label={c.seed}
            htmlFor='mock-seed'
            hint={c.seedHint}
            error={errors.seed ? c.seedError : undefined}
          >
            <Input
              id='mock-seed'
              value={seed}
              disabled={Boolean(busy)}
              maxLength={128}
              autoComplete='off'
              aria-invalid={Boolean(errors.seed)}
              aria-describedby={
                errors.seed ? 'mock-seed-error' : 'mock-seed-hint'
              }
              onChange={(event) => {
                setSeed(event.target.value);
                if (submitted)
                  setErrors((old) => ({
                    ...old,
                    seed: validSeed(event.target.value)
                      ? undefined
                      : c.seedError,
                  }));
              }}
            />
          </Field>
          <Field
            label={c.clock}
            htmlFor='mock-clock'
            hint={c.clockHint}
            error={errors.clock ? c.clockError : undefined}
          >
            <Input
              id='mock-clock'
              value={clock}
              disabled={Boolean(busy)}
              autoComplete='off'
              aria-invalid={Boolean(errors.clock)}
              aria-describedby={
                errors.clock ? 'mock-clock-error' : 'mock-clock-hint'
              }
              onChange={(event) => {
                setClock(event.target.value);
                if (submitted)
                  setErrors((old) => ({
                    ...old,
                    clock: validClock(event.target.value)
                      ? undefined
                      : c.clockError,
                  }));
              }}
            />
          </Field>
          <p className='text-sm text-muted-foreground'>{c.help}</p>
          {scenario === 'slow-cancel' ? (
            <p className='text-sm text-muted-foreground'>{c.cancelHelp}</p>
          ) : null}
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <span className='text-sm text-muted-foreground'>
              {c.revision}: {saved.revision}
            </span>
            <div className='flex flex-wrap justify-end gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={Boolean(busy)}
                onClick={() => {
                  setError(null);
                  setConfirm(true);
                }}
              >
                {c.reset}
              </Button>
              <Button type='submit' disabled={Boolean(busy)}>
                {busy === 'save' ? c.saving : c.save}
              </Button>
            </div>
          </div>
        </form>
        <Confirm
          open={confirm}
          pending={Boolean(busy)}
          title={c.resetTitle.replace('{id}', initial.projectId)}
          description={c.resetBody}
          confirm={busy === 'reset' ? c.resetting : c.reset}
          cancel={c.cancel}
          onOpenChange={(open) => {
            if (!busyRef.current) setConfirm(open);
          }}
          onConfirm={() => {
            void submit('reset');
          }}
        >
          {error ? (
            <ErrorNotice
              error={error}
              c={c}
              reload={() => {
                setConfirm(false);
                reload();
              }}
            />
          ) : null}
        </Confirm>
      </Card>
    );
  }
  function MockSettingsPage() {
    const context = host.useContext(),
      c = copy(context.locale);
    return (
      <Page title={c.title} description={c.description}>
        {context.role === 'admin' ? (
          <SettingsContent
            key={context.scopeKey}
            projectId={context.projectId}
            locale={context.locale}
          />
        ) : (
          <p>{c.onlyAdmin}</p>
        )}
      </Page>
    );
  }
  return { MockSettingsPage, MockIndicator };
}
