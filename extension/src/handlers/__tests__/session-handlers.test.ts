/**
 * Tests for the sidebar-facing session handlers, focused on the new
 * `session.setMode` route the mode picker calls.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { SessionRegistry } from '../../sessions';

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => boolean | void;

const listeners: Listener[] = [];

beforeAll(async () => {
  const chrome = (
    globalThis as unknown as {
      chrome: { runtime: { onMessage: { addListener: (l: Listener) => void } } };
    }
  ).chrome;
  chrome.runtime.onMessage.addListener = (l: Listener) => {
    listeners.push(l);
  };

  const mod = await import('../session-handlers');
  mod.registerSessionHandlers();
});

async function dispatch(message: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve) => {
    let resolved = false;
    const sendResponse = (response: unknown): void => {
      if (resolved) return;
      resolved = true;
      resolve(response);
    };
    let async = false;
    for (const l of listeners) {
      const r = l(message, {} as chrome.runtime.MessageSender, sendResponse);
      if (r === true) async = true;
    }
    if (!async && !resolved) resolve(undefined);
  });
}

describe('session-handlers', () => {

  describe('session.setMode', () => {
    it('400s on missing fields', async () => {
      const r = (await dispatch({ type: 'session.setMode' })) as {
        ok: boolean;
        error?: string;
      };
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/Missing/);
    });

    it('reports session not found for an unknown id', async () => {
      const r = (await dispatch({
        type: 'session.setMode',
        sessionId: 'nope',
        mode: 'plan',
      })) as { ok: boolean; error?: string };
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/not found/i);
    });

    it('narrows execute → plan successfully', async () => {
      const created = SessionRegistry.createExplicitSession(
        'https://session-handler.example',
        {
          name: 'test',
          mode: 'execute',
          capabilities: { tools: [], browser: ['read'] },
        },
      );
      expect(created.success).toBe(true);
      const sessionId = created.sessionId!;

      const r = (await dispatch({
        type: 'session.setMode',
        sessionId,
        mode: 'plan',
      })) as { ok: boolean; upgraded: boolean };
      expect(r.ok).toBe(true);
      expect(r.upgraded).toBe(true);

      const session = SessionRegistry.getSession(sessionId);
      expect(session?.mode).toBe('plan');
    });

    it('refuses widening (plan → execute) without crashing', async () => {
      const created = SessionRegistry.createExplicitSession(
        'https://widen.example',
        {
          name: 'test',
          mode: 'plan',
          capabilities: { tools: [], browser: ['read'] },
        },
      );
      expect(created.success).toBe(true);
      const sessionId = created.sessionId!;

      const r = (await dispatch({
        type: 'session.setMode',
        sessionId,
        mode: 'execute',
      })) as { ok: boolean; upgraded: boolean };
      // The handler reports `ok: true` (the request was processed
      // without error) and `upgraded: false` (the mode lattice rejected
      // the change). The sidebar uses this distinction to surface a
      // refusal toast rather than an error.
      expect(r.ok).toBe(true);
      expect(r.upgraded).toBe(false);

      const session = SessionRegistry.getSession(sessionId);
      expect(session?.mode).toBe('plan');
    });
  });
});
