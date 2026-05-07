/**
 * Audit / Watchdog handlers (sidebar-facing)
 *
 * The sidebar reads from these to render the Activity panel and the
 * watchdog overview. The actual audit log lives in policy/audit.ts; this
 * module just adapts it to Harbor's internal `registerHandler`
 * mechanism so the sidebar can `browserAPI.runtime.sendMessage` for
 * records.
 */

import { registerHandler } from './types';
import { Audit } from '../policy/audit';
import { Watchdog } from '../policy/watchdog';
import { simulate, replay } from '../policy/simulator';

export function registerAuditHandlers(): void {
  registerHandler('audit.query', (message, _sender, sendResponse) => {
    const filters = (message as { filters?: Parameters<typeof Audit.query>[0] }).filters || {};
    try {
      const records = Audit.query(filters);
      sendResponse({ ok: true, records });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return false;
  });

  registerHandler('audit.summarize', (message, _sender, sendResponse) => {
    const sinceMs = (message as { sinceMs?: number }).sinceMs;
    try {
      sendResponse({ ok: true, summary: Audit.summarize({ sinceMs }) });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    return false;
  });

  registerHandler('audit.clear', (_message, _sender, sendResponse) => {
    Audit.clear();
    sendResponse({ ok: true });
    return false;
  });

  registerHandler('policy.simulate', (message, _sender, sendResponse) => {
    const input = (message as { input?: Parameters<typeof simulate>[0] }).input;
    if (!input) {
      sendResponse({ ok: false, error: 'Missing input' });
      return true;
    }
    (async () => {
      try {
        const result = await simulate(input);
        sendResponse({ ok: true, result });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  });

  registerHandler('policy.replay', (message, _sender, sendResponse) => {
    const { recordId, modifications } = message as {
      recordId?: string;
      modifications?: Parameters<typeof replay>[1];
    };
    if (!recordId) {
      sendResponse({ ok: false, error: 'Missing recordId' });
      return true;
    }
    (async () => {
      try {
        const result = await replay(recordId, modifications);
        sendResponse({ ok: true, result });
      } catch (e) {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    })();
    return true;
  });

  registerHandler('watchdog.snapshot', (message, _sender, sendResponse) => {
    const { origin } = message as { origin?: string };
    if (origin) {
      sendResponse({ ok: true, state: Watchdog.inspect(origin) });
    } else {
      const summary = Audit.summarize();
      sendResponse({
        ok: true,
        thresholds: Watchdog.getThresholds(),
        origins: Object.entries(summary.byOrigin).map(([o, count]) => ({
          origin: o,
          decisions: count,
          watchdog: Watchdog.inspect(o),
        })),
      });
    }
    return false;
  });

  registerHandler('watchdog.resetOrigin', (message, _sender, sendResponse) => {
    const { origin } = message as { origin?: string };
    if (!origin) {
      sendResponse({ ok: false, error: 'Missing origin' });
      return true;
    }
    Watchdog.reset(origin);
    sendResponse({ ok: true });
    return false;
  });
}
