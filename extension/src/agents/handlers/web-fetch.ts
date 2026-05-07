/**
 * Web fetch handler for proxying HTTP requests.
 */

import type { RequestContext, ResponseSender } from './router-types';
import { requireAction } from './helpers';

// Allowed domains for web fetch (user configurable in the future)
const FETCH_ALLOWED_DOMAINS: string[] = [];

/**
 * Handle agent.fetch - Proxy HTTP requests through the extension.
 */
export async function handleAgentFetch(
  ctx: RequestContext,
  sender: ResponseSender,
): Promise<void> {
  const payload = ctx.payload as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(payload.url);
  } catch {
    sender.sendResponse({
      id: ctx.id,
      ok: false,
      error: { code: 'ERR_INTERNAL', message: 'Invalid URL' },
    });
    return;
  }

  // Pick same-origin vs cross-origin so the engine can apply the right
  // info-flow rules. Reads of cross-origin resources are stricter.
  const callerOrigin = ctx.origin;
  const callerHost = (() => {
    try {
      return new URL(callerOrigin).host;
    } catch {
      return '';
    }
  })();
  const action =
    parsedUrl.host === callerHost
      ? 'network.egress.same_origin'
      : 'network.egress.cross_origin';

  if (
    !(await requireAction(ctx, sender, action, {
      resource: { host: parsedUrl.host, path: parsedUrl.pathname },
      reason: `Fetch ${parsedUrl.host}${parsedUrl.pathname}`,
    }))
  ) {
    return;
  }

  try {
    const url = parsedUrl;
    
    // Check domain allowlist (for now, allow all - user will configure)
    // In production, this should check against user's configured allowlist
    if (FETCH_ALLOWED_DOMAINS.length > 0 && !FETCH_ALLOWED_DOMAINS.includes(url.hostname)) {
      sender.sendResponse({
        id: ctx.id,
        ok: false,
        error: {
          code: 'ERR_PERMISSION_DENIED',
          message: `Domain ${url.hostname} is not in the allowed list`,
        },
      });
      return;
    }

    const response = await fetch(payload.url, {
      method: payload.method || 'GET',
      headers: payload.headers,
      body: payload.body,
    });

    const text = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    sender.sendResponse({
      id: ctx.id,
      ok: true,
      result: {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        text,
      },
    });
  } catch (error) {
    sender.sendResponse({
      id: ctx.id,
      ok: false,
      error: {
        code: 'ERR_INTERNAL',
        message: error instanceof Error ? error.message : 'Fetch failed',
      },
    });
  }
}
