import type { BetterAuthPlugin } from "better-auth";

/**
 * Plugin to skip OAuth state cookie check in development.
 * Cross-origin localhost setups cause state_mismatch errors because
 * cookies aren't shared between different localhost ports.
 * SECURITY: Only use in development!
 */
export function skipStateMismatch(): BetterAuthPlugin {
  return {
    id: "skip-state-mismatch",
    init(ctx) {
      return {
        context: {
          ...ctx,
          oauthConfig: {
            skipStateCookieCheck: true,
            ...ctx?.oauthConfig,
          },
        },
      };
    },
  };
}
