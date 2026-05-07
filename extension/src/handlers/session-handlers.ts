/**
 * Session Handlers
 * 
 * Handlers for session management (sidebar UI).
 */

import { registerHandler } from './types';
import { SessionRegistry } from '../sessions';
import type { SessionMode } from '../policy/tokens';

export function registerSessionHandlers(): void {
  // List sessions
  registerHandler('session.list', (message, _sender, sendResponse) => {
    const { origin, status, type, activeOnly } = message as {
      origin?: string;
      status?: 'active' | 'suspended' | 'terminated';
      type?: 'implicit' | 'explicit';
      activeOnly?: boolean;
    };
    try {
      const sessions = SessionRegistry.listSessions({ origin, status, type, activeOnly });
      sendResponse({ ok: true, sessions });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  });

  // Terminate session
  registerHandler('session.terminate', (message, _sender, sendResponse) => {
    const { sessionId, origin } = message as { sessionId?: string; origin?: string };
    if (!sessionId || !origin) {
      sendResponse({ ok: false, error: 'Missing sessionId or origin' });
      return true;
    }
    try {
      const terminated = SessionRegistry.terminateSession(sessionId, origin);
      sendResponse({ ok: true, terminated });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  });

  // Re-attenuate a session's mode. Used by the sidebar's mode picker
  // and by `agent.upgradeSession` on the page side. The registry
  // refuses widening attempts (e.g. plan → execute) and returns false.
  // The sidebar already trusts the user to pick a session it owns;
  // it does not need to re-prove origin here, so we look the session
  // up to recover its origin before forwarding to the registry, which
  // does the actual origin check.
  registerHandler('session.setMode', (message, _sender, sendResponse) => {
    const { sessionId, mode } = message as {
      sessionId?: string;
      mode?: SessionMode;
    };
    if (!sessionId || !mode) {
      sendResponse({ ok: false, error: 'Missing sessionId or mode' });
      return true;
    }
    try {
      const session = SessionRegistry.getSession(sessionId);
      if (!session) {
        sendResponse({ ok: false, error: 'Session not found' });
        return true;
      }
      const upgraded = SessionRegistry.setMode(sessionId, session.origin, mode);
      sendResponse({ ok: true, upgraded });
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  });

  // Get session
  registerHandler('session.get', (message, _sender, sendResponse) => {
    const { sessionId } = message as { sessionId?: string };
    if (!sessionId) {
      sendResponse({ ok: false, error: 'Missing sessionId' });
      return true;
    }
    try {
      const session = SessionRegistry.getSession(sessionId);
      if (!session) {
        sendResponse({ ok: false, error: 'Session not found' });
      } else {
        sendResponse({ ok: true, session });
      }
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  });
}
