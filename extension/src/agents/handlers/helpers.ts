/**
 * Shared helper functions for request handlers.
 *
 * The primary entry point handlers use is `requireAction(ctx, sender,
 * action, options)`, which routes through the PolicyEngine. The engine
 * walks the 9-tier ladder and returns a decision; on `ask` or `preview`
 * we surface the existing prompt UI; on `allow` the handler proceeds; on
 * `deny` the handler emits a structured error response.
 *
 * The legacy `requirePermission(ctx, sender, scope)` is preserved as a
 * thin shim that resolves the colon-form scope to its primary typed
 * action and delegates. Subsequent commits will drop the shim once every
 * handler is migrated, but for one commit they coexist so the migration
 * is mechanical and reviewable.
 */

import type { PermissionScope } from '../types';
import type { RequestContext, ResponseSender } from './router-types';
import { evaluate, type PolicyResource, type PolicyDecision } from '../../policy/engine';
import type { TypedAction } from '../../policy/actions';
import type { LabelSet } from '../../policy/labels';
import type { SessionMode } from '../../policy/tokens';
import { showPermissionPrompt } from '../../policy/permissions';
import { grantPermissions } from '../../policy/permissions';

const DEBUG = false;

export function log(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[Harbor Router]', ...args);
  }
}

// =============================================================================
// requireAction — the new typed-action gate
// =============================================================================

export interface RequireActionOptions {
  /** Resource descriptor for the action (host, server, tool, etc.). */
  resource?: PolicyResource;
  /** Labels carried on the input (from prior reads). */
  inputLabels?: LabelSet;
  /** Capability token id, if the handler is operating inside a session. */
  tokenId?: string;
  /** Session mode override. Defaults to 'execute'. */
  mode?: SessionMode;
  /**
   * If the engine returns `ask` or `preview`, fall back to the legacy
   * prompt with this scope. When omitted, we derive a default from the
   * typed-action → legacy mapping; pass an explicit scope for handlers
   * whose prompt should ask the user about a different surface (e.g.
   * `agent.run` prompting for `model:tools`).
   */
  promptAsScope?: PermissionScope;
  /** Optional human-readable reason surfaced in the prompt. */
  reason?: string;
}

/**
 * The single chokepoint the rest of the codebase calls. Returns `true` if
 * the action is allowed (either by the engine or after a successful
 * prompt). Returns `false` and sends an error response when the action is
 * denied. Either way, after `requireAction` returns the handler's
 * obligation regarding permissioning is complete.
 */
export async function requireAction(
  ctx: RequestContext,
  sender: ResponseSender,
  action: TypedAction,
  options: RequireActionOptions = {},
): Promise<boolean> {
  log('requireAction', { origin: ctx.origin, action, options });

  const decision = await evaluate({
    origin: ctx.origin,
    action,
    resource: options.resource,
    inputLabels: options.inputLabels,
    tokenId: options.tokenId,
    mode: options.mode,
    reason: options.reason,
    correlationId: ctx.id,
  });

  log('requireAction decision', decision);

  if (decision.effect === 'allow') return true;

  if (decision.effect === 'deny') {
    return sendDeny(ctx, sender, decision);
  }

  // ask | preview | attenuate — surface the prompt via the existing flow.
  // We use the typed action's primary legacy scope unless the caller
  // overrides via options.promptAsScope.
  const scopeForPrompt = options.promptAsScope ?? primaryLegacyScope(action);
  if (!scopeForPrompt) {
    // No legacy mapping; treat as deny since we can't prompt yet.
    return sendDeny(ctx, sender, decision);
  }

  const promptResult = await showPermissionPrompt(
    ctx.origin,
    [scopeForPrompt],
    options.reason ?? decision.reason,
    options.resource?.tool ? [options.resource.tool] : undefined,
  );

  if (promptResult.granted && promptResult.grantType) {
    await grantPermissions(
      ctx.origin,
      [scopeForPrompt],
      promptResult.grantType,
      ctx.tabId,
      promptResult.allowedTools,
    );
    return true;
  }

  // User dismissed or denied.
  sender.sendResponse({
    id: ctx.id,
    ok: false,
    error: {
      code: 'ERR_PERMISSION_DENIED',
      message: promptResult.explicitDeny
        ? `User denied ${action}.`
        : `Permission "${action}" required.`,
      details: {
        action,
        tier: decision.tier,
        source: decision.source,
        reason: decision.reason,
      },
    },
  });
  return false;
}

function sendDeny(
  ctx: RequestContext,
  sender: ResponseSender,
  decision: PolicyDecision,
): false {
  sender.sendResponse({
    id: ctx.id,
    ok: false,
    error: {
      code: decision.errorCode ?? 'ERR_PERMISSION_DENIED',
      message: decision.reason,
      details: {
        tier: decision.tier,
        source: decision.source,
        rule: decision.rule,
      },
    },
  });
  return false;
}

// =============================================================================
// Typed-action → legacy-scope (for the prompt fallback)
// =============================================================================

/**
 * The primary legacy scope used to prompt for a typed action. Inverse of
 * the typed-to-legacy table in `policy/origin-grants.ts`, picking one
 * canonical scope per action.
 *
 * Returns `null` for typed actions that have no equivalent legacy scope
 * (e.g. `model.prompt.local` doesn't need a separate prompt; it inherits
 * the same UX as `model:prompt`).
 */
function primaryLegacyScope(action: TypedAction): PermissionScope | null {
  switch (action) {
    case 'model.list':
      return 'model:list';
    case 'model.prompt.local':
    case 'model.prompt.remote.firstParty':
    case 'model.prompt.remote.thirdParty':
      return 'model:prompt';

    case 'tool.list':
      return 'mcp:tools.list';
    case 'tool.call':
      return 'mcp:tools.call';
    case 'mcp.server.register':
      return 'mcp:servers.register';

    case 'browser.read.activeTab':
    case 'browser.read.element':
      return 'browser:activeTab.read';
    case 'browser.read.screenshot':
      return 'browser:activeTab.screenshot';
    case 'browser.read.tabs':
      return 'browser:tabs.read';
    case 'browser.write.interact':
      return 'browser:activeTab.interact';
    case 'browser.write.navigate':
      return 'browser:navigate';
    case 'browser.write.tabsCreate':
      return 'browser:tabs.create';

    case 'network.egress.same_origin':
    case 'network.egress.cross_origin':
      return 'web:fetch';

    case 'agent.register':
      return 'agents:register';
    case 'agent.discover':
      return 'agents:discover';
    case 'agent.invoke':
      return 'agents:invoke';
    case 'agent.message':
      return 'agents:message';
    case 'agent.delegate.crossOrigin':
      return 'agents:crossOrigin';
    case 'agent.delegate.remote':
      return 'agents:remote';
    case 'agent.run':
      return 'model:tools';

    case 'chat.open':
      return 'chat:open';

    case 'addressBar.suggest':
      return 'addressBar:suggest';
    case 'addressBar.read.context':
      return 'addressBar:context';
    case 'addressBar.read.history':
      return 'addressBar:history';
    case 'addressBar.execute':
      return 'addressBar:execute';
  }
}

// =============================================================================
// Legacy shim
// =============================================================================

/**
 * Legacy entry point. Resolves the colon-form scope to its primary typed
 * action and delegates to `requireAction`. New handlers should call
 * `requireAction` directly with the right typed action and resource.
 *
 * Kept during migration so unmigrated handlers continue to work; will be
 * removed once every call site is updated.
 */
export async function requirePermission(
  ctx: RequestContext,
  sender: ResponseSender,
  scope: PermissionScope,
): Promise<boolean> {
  const action = primaryTypedAction(scope);
  if (!action) {
    sender.sendResponse({
      id: ctx.id,
      ok: false,
      error: {
        code: 'ERR_SCOPE_REQUIRED',
        message: `Scope "${scope}" has no typed-action mapping.`,
        details: { requiredScope: scope },
      },
    });
    return false;
  }
  return requireAction(ctx, sender, action, { promptAsScope: scope });
}

/**
 * Inverse of `primaryLegacyScope`: pick the canonical typed action for a
 * legacy scope. Used only by the legacy `requirePermission` shim.
 */
function primaryTypedAction(scope: PermissionScope): TypedAction | null {
  switch (scope) {
    case 'model:prompt':
      return 'model.prompt.remote.firstParty';
    case 'model:tools':
      return 'agent.run';
    case 'model:list':
      return 'model.list';
    case 'mcp:tools.list':
      return 'tool.list';
    case 'mcp:tools.call':
      return 'tool.call';
    case 'mcp:servers.register':
      return 'mcp.server.register';
    case 'browser:activeTab.read':
      return 'browser.read.activeTab';
    case 'browser:activeTab.interact':
      return 'browser.write.interact';
    case 'browser:activeTab.screenshot':
      return 'browser.read.screenshot';
    case 'browser:navigate':
      return 'browser.write.navigate';
    case 'browser:tabs.read':
      return 'browser.read.tabs';
    case 'browser:tabs.create':
      return 'browser.write.tabsCreate';
    case 'web:fetch':
      return 'network.egress.cross_origin';
    case 'chat:open':
      return 'chat.open';
    case 'addressBar:suggest':
      return 'addressBar.suggest';
    case 'addressBar:context':
      return 'addressBar.read.context';
    case 'addressBar:history':
      return 'addressBar.read.history';
    case 'addressBar:execute':
      return 'addressBar.execute';
    case 'agents:register':
      return 'agent.register';
    case 'agents:discover':
      return 'agent.discover';
    case 'agents:invoke':
      return 'agent.invoke';
    case 'agents:message':
      return 'agent.message';
    case 'agents:crossOrigin':
      return 'agent.delegate.crossOrigin';
    case 'agents:remote':
      return 'agent.delegate.remote';
  }
}
