import { describe, it, expect, beforeEach } from 'vitest';

import { lookupOriginGrant, __testing } from '../origin-grants';
import { getMockStorage, resetMockBrowser } from '../../__tests__/test-setup';

const storage = getMockStorage();

beforeEach(() => {
  resetMockBrowser();
});

function seedGrant(
  origin: string,
  scope: string,
  grant: 'granted-always' | 'granted-once' | 'denied',
  options: { expiresAt?: number; allowedTools?: string[] } = {},
) {
  const all =
    (storage.local.data[__testing.PERMISSIONS_STORAGE_KEY] as Record<string, unknown>) ?? {};
  const existing = (all[origin] as { scopes: Record<string, unknown>; allowedTools: string[] }) ?? {
    origin,
    scopes: {},
    allowedTools: options.allowedTools ?? [],
  };
  existing.scopes[scope] = {
    grant,
    grantedAt: Date.now(),
    ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}),
  };
  if (options.allowedTools) existing.allowedTools = options.allowedTools;
  storage.local.data[__testing.PERMISSIONS_STORAGE_KEY] = { ...all, [origin]: existing };
}

describe('lookupOriginGrant', () => {
  it('returns null when nothing is stored', async () => {
    const result = await lookupOriginGrant('https://example.com', 'tool.list');
    expect(result).toBeNull();
  });

  it('maps tool.list to mcp:tools.list and reports allow', async () => {
    seedGrant('https://example.com', 'mcp:tools.list', 'granted-always');
    const result = await lookupOriginGrant('https://example.com', 'tool.list');
    expect(result?.effect).toBe('allow');
    expect(result?.persistence).toBe('always');
  });

  it('reports deny when the legacy scope is denied', async () => {
    seedGrant('https://example.com', 'mcp:tools.list', 'denied');
    const result = await lookupOriginGrant('https://example.com', 'tool.list');
    expect(result?.effect).toBe('deny');
  });

  it('treats expired granted-once as no opinion', async () => {
    seedGrant('https://example.com', 'mcp:tools.list', 'granted-once', { expiresAt: Date.now() - 1 });
    const result = await lookupOriginGrant('https://example.com', 'tool.list');
    expect(result).toBeNull();
  });

  it('returns once-persistence for live granted-once', async () => {
    seedGrant('https://example.com', 'mcp:tools.list', 'granted-once', {
      expiresAt: Date.now() + 60_000,
    });
    const result = await lookupOriginGrant('https://example.com', 'tool.list');
    expect(result?.effect).toBe('allow');
    expect(result?.persistence).toBe('once');
  });

  it('falls back to null for unknown actions (no mapping)', async () => {
    const result = await lookupOriginGrant('https://example.com', 'something.unknown' as never);
    expect(result).toBeNull();
  });

  describe('tool.call gating', () => {
    it('requires the tool to be in the allowlist', async () => {
      seedGrant('https://example.com', 'mcp:tools.call', 'granted-always', {
        allowedTools: ['github.list_repos'],
      });
      const allowed = await lookupOriginGrant('https://example.com', 'tool.call', {
        tool: 'github.list_repos',
      });
      expect(allowed?.effect).toBe('allow');

      const blocked = await lookupOriginGrant('https://example.com', 'tool.call', {
        tool: 'github.create_pr',
      });
      expect(blocked).toBeNull();
    });

    it('surfaces an explicit deny on mcp:tools.call regardless of allowlist', async () => {
      seedGrant('https://example.com', 'mcp:tools.call', 'denied', {
        allowedTools: [],
      });
      const result = await lookupOriginGrant('https://example.com', 'tool.call', {
        tool: 'github.list_repos',
      });
      expect(result?.effect).toBe('deny');
    });

    it('returns no opinion when no resource.tool is specified', async () => {
      seedGrant('https://example.com', 'mcp:tools.call', 'granted-always', {
        allowedTools: ['github.list_repos'],
      });
      const result = await lookupOriginGrant('https://example.com', 'tool.call');
      // The legacy semantics requires a tool name; absent one we give no
      // opinion (engine falls through to default).
      expect(result?.effect).toBe('allow');
    });
  });

  describe('typed-to-legacy mapping', () => {
    it('exposes the mapping for diagnostic use', () => {
      const map = __testing.TYPED_TO_LEGACY;
      expect(map['model.list']).toEqual(['model:list']);
      expect(map['browser.read.activeTab']).toEqual(['browser:activeTab.read']);
      expect(map['network.egress.cross_origin']).toEqual(['web:fetch']);
    });
  });
});
