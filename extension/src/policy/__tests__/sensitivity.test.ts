import { describe, it, expect } from 'vitest';

import {
  classifyDomain,
  classifyElement,
  classifyTool,
  effectiveReversibility,
  effectiveSideEffect,
  mergeVerdicts,
  type ElementDescriptor,
  type ToolManifestMeta,
} from '../sensitivity';

describe('Domain classifier', () => {
  it('identifies SSO surfaces as credentials+identity', () => {
    const v = classifyDomain('accounts.google.com');
    expect(v.labels.has('credentials')).toBe(true);
    expect(v.labels.has('identity')).toBe(true);
    expect(v.confidence).toBe('high');
  });

  it('identifies payment domains', () => {
    expect(classifyDomain('checkout.stripe.com').labels.has('payments')).toBe(true);
    expect(classifyDomain('paypal.com').labels.has('payments')).toBe(true);
  });

  it('flags banking-style hostnames', () => {
    const v = classifyDomain('online.chase.com');
    expect(v.labels.has('payments')).toBe(true);
    expect(v.labels.has('identity')).toBe(true);
  });

  it('flags personal workspace surfaces as confidential', () => {
    expect(classifyDomain('mail.google.com').labels.has('confidential')).toBe(true);
    expect(classifyDomain('workspace.slack.com').labels.has('confidential')).toBe(true);
    expect(classifyDomain('docs.google.com').labels.has('confidential')).toBe(true);
  });

  it('returns an empty verdict for unknown domains', () => {
    const v = classifyDomain('example.com');
    expect(v.labels.isEmpty()).toBe(true);
    expect(v.confidence).toBe('low');
  });

  it('is case-insensitive', () => {
    expect(classifyDomain('MAIL.GOOGLE.COM').labels.has('confidential')).toBe(true);
  });
});

describe('Element classifier', () => {
  function input(overrides: Partial<ElementDescriptor>): ElementDescriptor {
    return { tag: 'input', ...overrides };
  }

  it('flags type=password as credentials', () => {
    const v = classifyElement(input({ type: 'password' }));
    expect(v.labels.has('credentials')).toBe(true);
    expect(v.confidence).toBe('high');
  });

  it('flags autocomplete=current-password as credentials', () => {
    const v = classifyElement(input({ type: 'text', autocomplete: 'current-password' }));
    expect(v.labels.has('credentials')).toBe(true);
  });

  it('flags one-time-code as credentials', () => {
    const v = classifyElement(input({ autocomplete: 'one-time-code' }));
    expect(v.labels.has('credentials')).toBe(true);
  });

  it('flags cc-number as payments', () => {
    const v = classifyElement(input({ autocomplete: 'cc-number' }));
    expect(v.labels.has('payments')).toBe(true);
  });

  it('flags cc-csc as payments with high confidence', () => {
    const v = classifyElement(input({ autocomplete: 'cc-csc' }));
    expect(v.labels.has('payments')).toBe(true);
    expect(v.confidence).toBe('high');
  });

  it('flags identity autocomplete fields', () => {
    const v = classifyElement(input({ autocomplete: 'street-address' }));
    expect(v.labels.has('identity')).toBe(true);
  });

  it('falls back to name/id heuristics when no autocomplete is set', () => {
    const v = classifyElement(input({ name: 'user_password', placeholder: 'Password' }));
    expect(v.labels.has('credentials')).toBe(true);
  });

  it('detects SSN field by name', () => {
    const v = classifyElement(input({ name: 'ssn', ariaLabel: 'Social Security Number' }));
    expect(v.labels.has('identity')).toBe(true);
  });

  it('returns empty for plain text inputs', () => {
    const v = classifyElement(input({ type: 'text', name: 'comment' }));
    expect(v.labels.isEmpty()).toBe(true);
  });

  it('multiple signals stack as multiple labels', () => {
    const v = classifyElement(
      input({ autocomplete: 'cc-number', name: 'card_with_password' }),
    );
    expect(v.labels.has('payments')).toBe(true);
  });
});

describe('Tool classifier', () => {
  it('honors risk tags from any manifest', () => {
    const manifest: ToolManifestMeta = {
      server: 'unknown',
      tool: 'do-thing',
      riskTags: ['payments', 'destructive'],
    };
    const v = classifyTool(manifest, /*manifestTrusted=*/ false);
    expect(v.labels.has('payments')).toBe(true);
    expect(v.confidence).toBe('high');
  });

  it('falls back to tool name heuristics when no tags', () => {
    const manifest: ToolManifestMeta = { server: 's', tool: 'rotate_api_key' };
    const v = classifyTool(manifest, true);
    expect(v.labels.has('credentials')).toBe(true);
  });

  it('returns an empty verdict for benign tools', () => {
    const manifest: ToolManifestMeta = { server: 's', tool: 'list_repos' };
    const v = classifyTool(manifest, true);
    expect(v.labels.isEmpty()).toBe(true);
  });

  it('records manifestTrusted in the verdict', () => {
    const manifest: ToolManifestMeta = { server: 's', tool: 'list_repos' };
    expect(classifyTool(manifest, true).manifestTrusted).toBe(true);
    expect(classifyTool(manifest, false).manifestTrusted).toBe(false);
  });
});

describe('effectiveReversibility / effectiveSideEffect', () => {
  it('honors reversible=true only when the manifest is trusted', () => {
    const manifest: ToolManifestMeta = {
      server: 's',
      tool: 't',
      reversible: true,
    };
    expect(effectiveReversibility(manifest, true)).toBe(true);
    expect(effectiveReversibility(manifest, false)).toBe(false);
  });

  it('treats untrusted manifests as having a side effect even when they claim otherwise', () => {
    const manifest: ToolManifestMeta = {
      server: 's',
      tool: 't',
      sideEffect: false,
    };
    expect(effectiveSideEffect(manifest, true)).toBe(false);
    expect(effectiveSideEffect(manifest, false)).toBe(true);
  });
});

describe('mergeVerdicts', () => {
  it('unions labels and takes the max confidence', () => {
    const a = classifyDomain('mail.google.com');
    const b = classifyElement({ tag: 'input', type: 'password' });
    const merged = mergeVerdicts([a, b]);
    expect(merged.labels.has('confidential')).toBe(true);
    expect(merged.labels.has('credentials')).toBe(true);
    expect(merged.confidence).toBe('high');
  });

  it('returns an empty verdict for an empty input list', () => {
    const merged = mergeVerdicts([]);
    expect(merged.labels.isEmpty()).toBe(true);
    expect(merged.confidence).toBe('low');
  });

  it('honors a manifestTrusted flag from any input verdict', () => {
    const tool = classifyTool({ server: 's', tool: 'rotate_api_key' }, true);
    const dom = classifyDomain('example.com');
    const merged = mergeVerdicts([dom, tool]);
    expect(merged.manifestTrusted).toBe(true);
  });
});
