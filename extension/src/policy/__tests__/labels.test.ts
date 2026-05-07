import { describe, it, expect } from 'vitest';

import {
  DATA_LABELS,
  LabelSet,
  type DataLabel,
  isLegalPropagation,
  propagateLabels,
  destinationAcceptsLabels,
  labelsBlockedByDestination,
  allLabels,
  isDataLabel,
} from '../labels';

describe('Label registry', () => {
  it('declares the five labels the doc names', () => {
    const labels = allLabels();
    expect(labels).toContain('credentials');
    expect(labels).toContain('payments');
    expect(labels).toContain('identity');
    expect(labels).toContain('regulated');
    expect(labels).toContain('confidential');
  });

  it('credentials and payments are the most severe labels', () => {
    expect(DATA_LABELS.credentials.severity).toBe('critical');
    expect(DATA_LABELS.payments.severity).toBe('critical');
  });

  it('isDataLabel only accepts known labels', () => {
    expect(isDataLabel('credentials')).toBe(true);
    expect(isDataLabel('not-a-label')).toBe(false);
  });
});

describe('LabelSet', () => {
  it('is empty by default', () => {
    expect(LabelSet.empty().isEmpty()).toBe(true);
    expect(LabelSet.empty().size()).toBe(0);
  });

  it('round-trips through JSON serialization', () => {
    const original = new LabelSet(['credentials', 'confidential']);
    const json = JSON.parse(JSON.stringify(original));
    const restored = LabelSet.fromArray(json);
    expect(restored.equals(original)).toBe(true);
  });

  it('toArray returns a stable, sorted list', () => {
    const a = new LabelSet(['confidential', 'credentials']);
    const b = new LabelSet(['credentials', 'confidential']);
    expect(a.toArray()).toEqual(b.toArray());
  });

  it('deduplicates initial values', () => {
    const set = new LabelSet(['credentials', 'credentials' as DataLabel]);
    expect(set.size()).toBe(1);
  });

  it('union merges without duplicates', () => {
    const a = new LabelSet(['credentials']);
    const b = new LabelSet(['confidential', 'credentials']);
    const merged = a.union(b);
    expect(merged.size()).toBe(2);
    expect(merged.has('credentials')).toBe(true);
    expect(merged.has('confidential')).toBe(true);
  });

  it('intersect picks common elements', () => {
    const a = new LabelSet(['credentials', 'confidential']);
    const b = new LabelSet(['confidential', 'identity']);
    const inter = a.intersect(b);
    expect(inter.toArray()).toEqual(['confidential']);
  });

  it('contains checks subset', () => {
    const a = new LabelSet(['credentials', 'confidential', 'identity']);
    const b = new LabelSet(['credentials', 'confidential']);
    expect(a.contains(b)).toBe(true);
    expect(b.contains(a)).toBe(false);
  });

  it('equals is true for set-equal sets regardless of construction order', () => {
    expect(new LabelSet(['a' as DataLabel, 'b' as DataLabel]).equals(new LabelSet(['b' as DataLabel, 'a' as DataLabel]))).toBe(true);
  });

  it('with and without are immutable', () => {
    const original = new LabelSet(['credentials']);
    const expanded = original.with('confidential');
    const reduced = original.without('credentials');
    expect(original.size()).toBe(1);
    expect(expanded.size()).toBe(2);
    expect(reduced.isEmpty()).toBe(true);
  });
});

describe('Propagation rules', () => {
  it('an output that drops an input label is illegal', () => {
    const inputs = [new LabelSet(['credentials'])];
    const output = new LabelSet([]);
    expect(isLegalPropagation(inputs, output)).toBe(false);
  });

  it('an output that preserves all input labels is legal', () => {
    const inputs = [new LabelSet(['credentials', 'confidential'])];
    const output = new LabelSet(['credentials', 'confidential']);
    expect(isLegalPropagation(inputs, output)).toBe(true);
  });

  it('an output may add new labels', () => {
    const inputs = [new LabelSet(['confidential'])];
    const output = new LabelSet(['confidential', 'credentials']);
    expect(isLegalPropagation(inputs, output)).toBe(true);
  });

  it('union of multiple inputs is the floor for the output', () => {
    const a = new LabelSet(['credentials']);
    const b = new LabelSet(['identity']);
    expect(propagateLabels([a, b]).toArray()).toEqual(['credentials', 'identity']);

    const tooSparse = new LabelSet(['credentials']);
    expect(isLegalPropagation([a, b], tooSparse)).toBe(false);

    const exact = new LabelSet(['credentials', 'identity']);
    expect(isLegalPropagation([a, b], exact)).toBe(true);
  });
});

describe('Destination gating', () => {
  it('a destination that accepts a label permits the flow', () => {
    const carried = new LabelSet(['confidential']);
    expect(destinationAcceptsLabels(carried, ['confidential'])).toBe(true);
  });

  it('a destination that does not accept a label rejects the flow', () => {
    const carried = new LabelSet(['credentials']);
    expect(destinationAcceptsLabels(carried, ['confidential'])).toBe(false);
  });

  it('a destination that accepts no labels rejects any labeled flow', () => {
    const carried = new LabelSet(['confidential']);
    expect(destinationAcceptsLabels(carried, [])).toBe(false);
  });

  it('an empty carrier flows to anywhere', () => {
    expect(destinationAcceptsLabels(LabelSet.empty(), [])).toBe(true);
    expect(destinationAcceptsLabels(LabelSet.empty(), ['confidential'])).toBe(true);
  });

  it('labelsBlockedByDestination returns the set of denied labels', () => {
    const carried = new LabelSet(['credentials', 'confidential']);
    const blocked = labelsBlockedByDestination(carried, ['confidential']);
    expect(blocked).toEqual(['credentials']);
  });
});
