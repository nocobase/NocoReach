import { envBoolean, type AppConfigFactory } from '@nocobase/app-server/config';
import { apiKey } from '@nocobase/app-plugin-api-keys/server';
import {
  defineAuthConfig,
  type AuthConfig,
} from '@nocobase/app-plugin-authentication/server';
import { DEMO_MODE_ENV } from '@nocobase/app-plugin-demo-mode/config';
import { bearer, deviceAuthorization, username } from 'better-auth/plugins';

/**
 * The command-line clients that may sign in through the browser (`deviceAuthorization()`): `nocobase-cli`, the id
 * `@nocobase/app-cli-client` sends unless a branded CLI names its own. Add the id of any other CLI that should sign in.
 */
const CLI_CLIENT_IDS: readonly string[] = ['nocobase-cli'];

/**
 * Sign-in cookies a cross-site iframe can keep. The public demo runs inside the website's product page, where
 * `SameSite=Lax` cookies are never sent back, so the demo would stay on the sign-in page. `Partitioned` (CHIPS) keeps
 * the cookies to that embedding site; the demo plugin's quick sign-in expires the unpartitioned ones they replace.
 */
const EMBEDDABLE_COOKIES = {
  sameSite: 'none',
  secure: true,
  partitioned: true,
} as const;

function isDemo(env: Readonly<Record<string, string | undefined>> | undefined) {
  const value = env?.[DEMO_MODE_ENV];
  return value !== undefined && envBoolean('enabled').parse?.(value) === true;
}

const auth: AppConfigFactory<AuthConfig> = defineAuthConfig({
  defaults: (runtime) => ({
    plugins: [
      username({ displayUsername: false }),
      apiKey(),
      // A CLI signs in through the browser (RFC 8628): it shows a code the person approves on `/device`, below the
      // application's base path, and receives a session token it sends as `Authorization: Bearer` (`bearer()`).
      deviceAuthorization({
        verificationUri: '/device',
        expiresIn: '10m',
        interval: '5s',
        validateClient: (clientId) => CLI_CLIENT_IDS.includes(clientId),
      }),
      bearer(),
    ],
    emailAndPassword: { enabled: true, autoSignIn: false },
    session: { storeSessionInDatabase: true },
    account: { encryptOAuthTokens: true },
    ...(isDemo(runtime?.env)
      ? { advanced: { defaultCookieAttributes: EMBEDDABLE_COOKIES } }
      : {}),
  }),
});

export default auth;
