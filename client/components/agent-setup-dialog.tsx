import {
  ApiClientError,
  resolveAppUrl,
  useApiClient,
  useToaster,
} from '@nocobase/app-client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import type { DownloadToken } from '@nocobase/app-plugin-agents/shared/runners';
import { useTranslation } from '@nocobase/i18n/client';
import { CheckIcon, CopyIcon, RefreshCwIcon } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { agentSetupCommands } from './agent-setup-prompt.js';

/** A temporary setup panel, not a record: closing it discards its download token. */
export function AgentSetupDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly returnFocus?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const [generation, setGeneration] = useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The wider read-only panel keeps shell instructions legible; the footer stays reachable on phones. */}
      <DialogContent
        finalFocus={returnFocus}
        className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl'
      >
        <DialogHeader className='shrink-0 pr-6'>
          <DialogTitle>{t('agentSetup.title')}</DialogTitle>
          <DialogDescription>{t('agentSetup.description')}</DialogDescription>
        </DialogHeader>
        {open ? (
          <SetupPrompt
            key={generation}
            onRegenerate={() => setGeneration((value) => value + 1)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SetupPrompt({ onRegenerate }: { readonly onRegenerate: () => void }) {
  const api = useApiClient();
  const { refresh } = useAuthentication();
  const { t } = useTranslation();
  const toaster = useToaster();
  const requestRef = useRef<Promise<{ data: DownloadToken }> | null>(null);
  const activeRef = useRef(false);
  const copyingRef = useRef(false);
  const [token, setToken] = useState<DownloadToken | null>(null);
  const [error, setError] = useState<
    'failed' | 'signedOut' | 'forbidden' | null
  >(null);
  const [expired, setExpired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const pending = token === null && error === null;

  useEffect(() => {
    activeRef.current = true;
    let current = true;
    // Keep one request through React's effect replay; no token enters a shared query cache.
    requestRef.current ??= api.request<{ data: DownloadToken }>({
      path: 'agents/dist/downloadTokens',
      method: 'POST',
    });
    void requestRef.current.then(
      (response) => {
        if (!current) return;
        const data = response?.data;
        if (
          typeof data?.token !== 'string' ||
          !data.token ||
          typeof data.expiresAt !== 'string' ||
          !Number.isFinite(Date.parse(data.expiresAt))
        ) {
          setError('failed');
          return;
        }
        setToken(data);
      },
      (failure: unknown) => {
        if (!current) return;
        setError(
          failure instanceof ApiClientError && failure.status === 401
            ? 'signedOut'
            : failure instanceof ApiClientError && failure.status === 403
              ? 'forbidden'
              : 'failed',
        );
      },
    );
    return () => {
      current = false;
      activeRef.current = false;
    };
  }, [api]);

  useEffect(() => {
    if (token === null) return;
    const delay = Math.max(0, Date.parse(token.expiresAt) - Date.now());
    const timer = window.setTimeout(() => setExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [token]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // The application's public browser origin must match app.publicOrigin; runtime basePath includes nested mounts.
  const server = new URL(resolveAppUrl('/'), window.location.origin).href;
  const prompt =
    token === null || expired
      ? null
      : t('agentSetup.prompt', {
          ...agentSetupCommands(server, token.token),
          interpolation: { escapeValue: false },
        });

  async function copy() {
    if (prompt === null || copyingRef.current || token === null) return;
    if (Date.parse(token.expiresAt) <= Date.now()) {
      setExpired(true);
      return;
    }
    copyingRef.current = true;
    setIsCopying(true);
    try {
      await navigator.clipboard.writeText(prompt);
      if (activeRef.current) setCopied(true);
    } catch {
      if (activeRef.current)
        toaster.show({ type: 'error', title: t('agentSetup.copyFailed') });
    } finally {
      copyingRef.current = false;
      if (activeRef.current) setIsCopying(false);
    }
  }

  async function signIn() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await refresh();
    } catch {
      if (activeRef.current)
        toaster.show({ type: 'error', title: t('agentSetup.signInFailed') });
    } finally {
      if (activeRef.current) setSigningIn(false);
    }
  }

  return (
    <>
      <div className='flex min-h-0 flex-col gap-4 overflow-y-auto'>
        {error !== null ? (
          <Alert variant='destructive'>
            <AlertDescription>{t(`agentSetup.${error}`)}</AlertDescription>
          </Alert>
        ) : expired ? (
          <Alert>
            <AlertDescription>{t('agentSetup.expired')}</AlertDescription>
          </Alert>
        ) : prompt === null ? (
          <div
            role='status'
            aria-label={t('agentSetup.preparing')}
            className='flex h-40 shrink-0 flex-col gap-3 rounded-lg border p-3'
          >
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-4 w-full' />
            <Skeleton className='h-4 w-5/6' />
            <span className='sr-only'>{t('agentSetup.preparing')}</span>
          </div>
        ) : (
          <pre
            aria-label={t('agentSetup.promptLabel')}
            className='rounded-lg border bg-muted p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap select-all'
          >
            {prompt}
          </pre>
        )}
        <div className='flex flex-col gap-1 text-sm text-muted-foreground'>
          <p>{t('agentSetup.identity')}</p>
          <p>{t('agentSetup.expiry')}</p>
          <p>{t('agentSetup.runtime')}</p>
        </div>
      </div>
      <DialogFooter className='shrink-0'>
        {error === 'signedOut' ? (
          <Button
            type='button'
            disabled={signingIn}
            onClick={() => void signIn()}
          >
            {signingIn ? <Spinner aria-hidden='true' /> : null}
            {t('agentSetup.signIn')}
          </Button>
        ) : error !== 'forbidden' ? (
          <>
            <Button
              type='button'
              variant='outline'
              disabled={pending || isCopying}
              onClick={onRegenerate}
            >
              {pending ? <Spinner aria-hidden='true' /> : <RefreshCwIcon />}
              {t('agentSetup.regenerate')}
            </Button>
            <Button
              type='button'
              disabled={prompt === null || isCopying}
              onClick={() => void copy()}
            >
              {isCopying ? (
                <Spinner aria-hidden='true' />
              ) : copied ? (
                <CheckIcon />
              ) : (
                <CopyIcon />
              )}
              {copied ? t('agentSetup.copied') : t('agentSetup.copy')}
            </Button>
          </>
        ) : null}
      </DialogFooter>
    </>
  );
}
