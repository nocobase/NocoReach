import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { $t } from '#i18n';
import { findNetworkFailure } from '#lib/network-failure';
import { InfoTip } from '#components/reach/info-tip';
import { buttonVariants } from '#components/ui/button';

/** Where to change how the server reaches the sites it reads. */
const NETWORK_SETTINGS = '/proxy-profiles';

/** An error in a connection panel or dialog. When the server got no answer from a site (NETWORK-EGRESS §3.3), it also
 * links to Settings › Network; an untrusted certificate explains the company root certificate in ⓘ. `network` marks
 * an error the caller already knows is about reaching a site, such as a Google authorization code. `actions` are
 * always shown (Retry); `hint` and `alternative` only for a site that cannot be reached, such as uploading a Skill
 * folder instead. */
export function ConnectionError({
  message,
  network,
  hint,
  alternative,
  actions,
}: {
  message: ReactNode;
  network?: boolean;
  hint?: ReactNode;
  alternative?: ReactNode;
  actions?: ReactNode;
}) {
  if (!message) return null;
  const failure =
    typeof message === 'string' ? findNetworkFailure(message) : null;
  if (!failure && !network)
    return (
      <p className='nr-error' role='alert'>
        {message}
        {actions}
      </p>
    );
  return (
    <div className='nr-error' role='alert'>
      <p className='basis-full'>
        {message}
        {failure?.reason === 'certificate' && (
          <InfoTip label={$t('network.certificateTip')} className='ml-1'>
            <p>{$t('network.certificateHelp')}</p>
          </InfoTip>
        )}
        {hint && <> {hint}</>}
      </p>
      {actions}
      {alternative}
      <Link
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
        to={NETWORK_SETTINGS}
      >
        {$t('network.openSettings')}
      </Link>
    </div>
  );
}

/** A link to Settings › Network after saved collection errors, shown when one of them is about reaching a site. */
export function NetworkSettingsLink({
  messages,
}: {
  messages: readonly (string | null | undefined)[] | undefined;
}) {
  if (!messages?.some((message) => findNetworkFailure(message))) return null;
  return (
    <Link className='nr-link nr-block' to={NETWORK_SETTINGS}>
      {$t('network.openSettings')}
    </Link>
  );
}
