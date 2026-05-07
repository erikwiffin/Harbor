import { describe, it, expect, beforeEach } from 'vitest';

import {
  trustManifest,
  Publishers,
  Pins,
  type ManifestProvenance,
} from '../manifest-trust';

beforeEach(() => {
  Publishers.__reset();
  Pins.__reset();
});

describe('Bundled manifests', () => {
  it('are always trusted', () => {
    const v = trustManifest({ serverId: 'github', source: 'bundled' });
    expect(v.trusted).toBe(true);
    expect(v.source).toBe('bundled');
  });
});

describe('Local install', () => {
  it('is trusted by default', () => {
    const v = trustManifest({ serverId: 'custom', source: 'localInstall' });
    expect(v.trusted).toBe(true);
  });
});

describe('Page-declared manifests', () => {
  it('are never trusted', () => {
    const v = trustManifest({ serverId: 'whatever', source: 'pageDeclared' });
    expect(v.trusted).toBe(false);
    expect(v.reason).toMatch(/page/);
  });
});

describe('Fetched manifests', () => {
  it('are not trusted by default', () => {
    const v = trustManifest({ serverId: 'whatever', source: 'fetched' });
    expect(v.trusted).toBe(false);
  });
});

describe('Unknown source', () => {
  it('is not trusted', () => {
    const v = trustManifest({ serverId: 'whatever', source: 'unknown' });
    expect(v.trusted).toBe(false);
  });
});

describe('Signed manifests', () => {
  const exampleKey: ManifestProvenance['signature'] = {
    algorithm: 'ed25519',
    publicKey: 'pub-anthropic',
    signature: 'sig-base64',
  };

  it('are not trusted if no publisher is registered', () => {
    const v = trustManifest({
      serverId: '@anthropic/example',
      source: 'signed',
      signature: exampleKey,
    });
    expect(v.trusted).toBe(false);
    expect(v.reason).toMatch(/not in the publisher registry/);
  });

  it('are trusted when the publisher is registered and the bridge verified', () => {
    Publishers.add({
      name: 'Anthropic',
      algorithm: 'ed25519',
      publicKey: 'pub-anthropic',
      addedAt: Date.now(),
    });
    const v = trustManifest({
      serverId: '@anthropic/example',
      source: 'signed',
      signature: { ...exampleKey!, verified: true } as never,
    });
    expect(v.trusted).toBe(true);
    expect(v.source).toBe('signed');
  });

  it('are not trusted when bridge reports verified=false', () => {
    Publishers.add({
      name: 'Anthropic',
      algorithm: 'ed25519',
      publicKey: 'pub-anthropic',
      addedAt: Date.now(),
    });
    const v = trustManifest({
      serverId: '@anthropic/example',
      source: 'signed',
      signature: { ...exampleKey!, verified: false } as never,
    });
    expect(v.trusted).toBe(false);
  });

  it('respects allowedServerGlob', () => {
    Publishers.add({
      name: 'Anthropic',
      algorithm: 'ed25519',
      publicKey: 'pub-anthropic',
      addedAt: Date.now(),
      allowedServerGlob: '@anthropic/*',
    });
    const ok = trustManifest({
      serverId: '@anthropic/example',
      source: 'signed',
      signature: { ...exampleKey!, verified: true } as never,
    });
    expect(ok.trusted).toBe(true);

    const bad = trustManifest({
      serverId: '@unknown/foo',
      source: 'signed',
      signature: { ...exampleKey!, verified: true } as never,
    });
    expect(bad.trusted).toBe(false);
    expect(bad.reason).toMatch(/not allowed to sign/);
  });

  it('refuses if signature is missing', () => {
    const v = trustManifest({
      serverId: '@anthropic/example',
      source: 'signed',
    });
    expect(v.trusted).toBe(false);
    expect(v.reason).toMatch(/no signature/);
  });
});

describe('Policy-pinned manifests', () => {
  it('are trusted when pinned by hash', () => {
    Pins.pin('@some/server', 'sha256:abc');
    const v = trustManifest({
      serverId: '@some/server',
      source: 'policyPinned',
      manifestHash: 'sha256:abc',
    });
    expect(v.trusted).toBe(true);
  });

  it('are untrusted when the hash does not match', () => {
    Pins.pin('@some/server', 'sha256:abc');
    const v = trustManifest({
      serverId: '@some/server',
      source: 'policyPinned',
      manifestHash: 'sha256:something-else',
    });
    expect(v.trusted).toBe(false);
  });

  it('are untrusted when no hash is supplied', () => {
    const v = trustManifest({
      serverId: '@some/server',
      source: 'policyPinned',
    });
    expect(v.trusted).toBe(false);
  });
});

describe('Publisher registry', () => {
  it('add and remove publishers', () => {
    Publishers.add({
      name: 'Acme',
      algorithm: 'ed25519',
      publicKey: 'pub-acme',
      addedAt: Date.now(),
    });
    expect(Publishers.has('pub-acme')).toBe(true);
    expect(Publishers.list()).toHaveLength(1);
    expect(Publishers.remove('pub-acme')).toBe(true);
    expect(Publishers.list()).toHaveLength(0);
  });
});

describe('Pin registry', () => {
  it('pin and unpin manifest hashes', () => {
    Pins.pin('a', 'h1');
    Pins.pin('a', 'h2');
    Pins.pin('b', 'h3');
    expect(Pins.isPinned('a', 'h1')).toBe(true);
    expect(Pins.isPinned('a', 'h2')).toBe(true);
    expect(Pins.isPinned('a', 'h3')).toBe(false);
    expect(Pins.unpin('a', 'h2')).toBe(true);
    expect(Pins.isPinned('a', 'h2')).toBe(false);
    const list = Pins.list();
    expect(list.find((p) => p.serverId === 'a')?.hashes).toEqual(['h1']);
  });
});
