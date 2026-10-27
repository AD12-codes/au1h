import type { BetterAuthClientPlugin } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { emailOTPClient, magicLinkClient } from "better-auth/client/plugins";
import {
  type Au1hClientOptions,
  betterAuthClientOptions,
  createTokenManager,
  type TokenManager,
} from "./core";

export {
  type Au1hClientOptions,
  Au1hError,
  type Au1hJwtClaims,
  createTokenManager,
  decodeJwt,
  localStorageStorage,
  memoryStorage,
  type TokenManager,
  type TokenStorage,
} from "./core";

export interface CreateAu1hClientOptions<
  P extends BetterAuthClientPlugin[] = [],
> extends Au1hClientOptions {
  /** Extra Better Auth client plugins (e.g. `organizationClient()`). */
  plugins?: P;
}

/**
 * Always on, because the au1h server always serves them: `signIn.magicLink`,
 * `emailOtp.sendVerificationOtp`, `signIn.emailOtp`, …
 */
type BuiltInPlugins = [
  ReturnType<typeof magicLinkClient>,
  ReturnType<typeof emailOTPClient>,
];

type BetterAuthOptionsFor<P extends BetterAuthClientPlugin[]> = ReturnType<
  typeof betterAuthClientOptions
> & { plugins: [...BuiltInPlugins, ...P] };

export type Au1hClient<P extends BetterAuthClientPlugin[] = []> = ReturnType<
  typeof createAuthClient<BetterAuthOptionsFor<P>>
> &
  TokenManager & { appSlug: string };

/**
 * A Better Auth client bound to one au1h application, plus `getToken`,
 * `authFetch` and `proxyFetch`.
 *
 * ```ts
 * export const auth = createAu1hClient({ baseURL: AU1H_URL, appSlug: "my-app" });
 * await auth.signIn.email({ email, password });
 * await auth.signIn.magicLink({ email, callbackURL: "/" });
 * const res = await auth.authFetch("https://api.my-app.com/me");
 * ```
 */
export function createAu1hClient<P extends BetterAuthClientPlugin[] = []>(
  options: CreateAu1hClientOptions<P>
): Au1hClient<P> {
  const tokens = createTokenManager(options);
  const client = createAuthClient({
    ...betterAuthClientOptions(options, tokens),
    plugins: [
      magicLinkClient(),
      emailOTPClient(),
      ...(options.plugins ?? ([] as unknown as P)),
    ] as [...BuiltInPlugins, ...P],
  });
  return Object.assign(client, tokens, {
    appSlug: options.appSlug,
  }) as Au1hClient<P>;
}
