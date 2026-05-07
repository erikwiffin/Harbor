/**
 * Data Labels Registry
 *
 * Information-flow tracking. Reads of sensitive content attach labels; labels
 * propagate through prompts, tool inputs, and fetch bodies; egress actions
 * are gated by which labels they accept.
 *
 * See `docs/PERMISSIONS.md` (Part 1: How it works → "Information-flow labels")
 * for the conceptual model.
 */

// =============================================================================
// Label set
// =============================================================================

/**
 * The closed set of labels Harbor recognizes.
 *
 * This is intentionally small. Labels are *coarse* — they don't try to
 * classify every possible kind of sensitive data. They're meant to gate the
 * cases where Harbor can be confident: password fields, payment forms, the
 * user's own confidential workspaces, etc.
 *
 * Adding a label is a code change here plus a sensitivity classifier rule.
 */
export type DataLabel =
  /** Passwords, API keys, tokens, MFA codes, recovery phrases. */
  | 'credentials'
  /** Card numbers, account numbers, bank routing, PSP tokens, payment metadata. */
  | 'payments'
  /** SSN / gov ID, DOB, full name+address tuples, biometric refs. */
  | 'identity'
  /** Legally protected — PHI, financial records, regulated industries. */
  | 'regulated'
  /** User-marked confidential, intranet content, gmail/slack/notion/docs. */
  | 'confidential';

/**
 * Static metadata for each label, used by the policy editor and prompts.
 */
export interface LabelMeta {
  /** Short title shown in the UI. */
  title: string;
  /** One-sentence explanation aimed at users authoring policy. */
  description: string;
  /**
   * Egress severity for this label. Higher means we're more reluctant to let
   * it cross trust boundaries without explicit confirmation.
   *
   * The PolicyEngine uses `severity` only as a tiebreaker when multiple
   * labels appear on the same data — the actual gate is whether the
   * destination action's `acceptsLabels` includes the label.
   */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export const DATA_LABELS: Record<DataLabel, LabelMeta> = {
  credentials: {
    title: 'Credentials',
    description: 'Passwords, API keys, tokens, recovery phrases, MFA codes.',
    severity: 'critical',
  },
  payments: {
    title: 'Payments',
    description: 'Card numbers, bank account numbers, PSP tokens, payment metadata.',
    severity: 'critical',
  },
  identity: {
    title: 'Identity',
    description: 'Government IDs, SSN, date of birth, address tuples.',
    severity: 'high',
  },
  regulated: {
    title: 'Regulated',
    description: 'Legally protected — PHI, financial records, regulated content.',
    severity: 'high',
  },
  confidential: {
    title: 'Confidential',
    description: 'User-marked confidential or content from a private workspace.',
    severity: 'medium',
  },
};

// =============================================================================
// LabelSet — the runtime carrier
// =============================================================================

/**
 * A `LabelSet` is the concrete value attached to data flowing through Harbor.
 * It's a small set of label tags, deduplicated.
 *
 * We expose a class instead of a bare `Set<DataLabel>` for two reasons:
 *  1. The propagation rules (union, subset) live next to the data structure.
 *  2. `Set` doesn't serialize naturally for IPC; `LabelSet` does.
 */
export class LabelSet {
  private readonly tags: Set<DataLabel>;

  constructor(initial: Iterable<DataLabel> = []) {
    this.tags = new Set(initial);
  }

  /** True if this set has no labels. */
  isEmpty(): boolean {
    return this.tags.size === 0;
  }

  /** Number of labels in the set. */
  size(): number {
    return this.tags.size;
  }

  /** True if `label` is in the set. */
  has(label: DataLabel): boolean {
    return this.tags.has(label);
  }

  /** Return all labels as a sorted array (sorting makes equality stable). */
  toArray(): DataLabel[] {
    return [...this.tags].sort();
  }

  /** Serialize for IPC. Round-trips through `LabelSet.fromArray`. */
  toJSON(): DataLabel[] {
    return this.toArray();
  }

  /** Iterate labels (sorted). */
  [Symbol.iterator](): IterableIterator<DataLabel> {
    return this.toArray()[Symbol.iterator]();
  }

  /** Union of two sets. */
  union(other: LabelSet): LabelSet {
    return new LabelSet([...this.tags, ...other.tags]);
  }

  /** Intersection of two sets. */
  intersect(other: LabelSet): LabelSet {
    const out: DataLabel[] = [];
    for (const tag of this.tags) {
      if (other.has(tag)) out.push(tag);
    }
    return new LabelSet(out);
  }

  /** Whether every label in `subset` is also in this set. */
  contains(subset: LabelSet): boolean {
    for (const tag of subset.tags) {
      if (!this.tags.has(tag)) return false;
    }
    return true;
  }

  /** Set equality. */
  equals(other: LabelSet): boolean {
    if (this.tags.size !== other.tags.size) return false;
    return this.contains(other);
  }

  /** A new set with one additional label. */
  with(label: DataLabel): LabelSet {
    return new LabelSet([...this.tags, label]);
  }

  /** A new set with one label removed. */
  without(label: DataLabel): LabelSet {
    return new LabelSet([...this.tags].filter((t) => t !== label));
  }

  /** Construct a `LabelSet` from a serialized array. */
  static fromArray(labels: readonly DataLabel[] | undefined | null): LabelSet {
    return new LabelSet(labels ?? []);
  }

  /** The empty label set. */
  static empty(): LabelSet {
    return new LabelSet();
  }
}

// =============================================================================
// Propagation
// =============================================================================

/**
 * Whether `output` is a legal propagation of `inputs`.
 *
 * The rule, expressed simply: an output's labels must be a *superset* of the
 * union of every input's labels. Code is allowed to add new labels (label
 * the result more restrictively) but never to drop them.
 *
 * This check is what lets the engine catch label laundering — a tool
 * receives a `confidential` document and tries to return an "anonymized"
 * version with no labels. The engine refuses that propagation; the tool
 * must declare an explicit `declassify` capability to drop a label.
 */
export function isLegalPropagation(inputs: readonly LabelSet[], output: LabelSet): boolean {
  let union = LabelSet.empty();
  for (const inp of inputs) {
    union = union.union(inp);
  }
  return output.contains(union);
}

/**
 * Compute the union of all input labels — the *minimum* label set the
 * caller's output must carry.
 */
export function propagateLabels(inputs: readonly LabelSet[]): LabelSet {
  let union = LabelSet.empty();
  for (const inp of inputs) {
    union = union.union(inp);
  }
  return union;
}

/**
 * Whether a destination action's `acceptsLabels` is a valid sink for `carried`.
 *
 * The destination's `acceptsLabels` is the *whitelist* of labels it tolerates.
 * If `carried` has any label not in that whitelist, this returns `false` and
 * the engine emits `ERR_LABEL_FLOW_BLOCKED` at Tier 3.
 */
export function destinationAcceptsLabels(
  carried: LabelSet,
  acceptsLabels: readonly DataLabel[],
): boolean {
  const accepted = new Set<DataLabel>(acceptsLabels);
  for (const tag of carried) {
    if (!accepted.has(tag)) return false;
  }
  return true;
}

/**
 * Helper: which labels in `carried` are not accepted by `acceptsLabels`.
 * Used for building informative error messages and prompts.
 */
export function labelsBlockedByDestination(
  carried: LabelSet,
  acceptsLabels: readonly DataLabel[],
): DataLabel[] {
  const accepted = new Set<DataLabel>(acceptsLabels);
  const blocked: DataLabel[] = [];
  for (const tag of carried) {
    if (!accepted.has(tag)) blocked.push(tag);
  }
  return blocked.sort();
}

/**
 * Convenience: iterate every known label.
 */
export function allLabels(): DataLabel[] {
  return Object.keys(DATA_LABELS) as DataLabel[];
}

/**
 * Whether a name is a known label.
 */
export function isDataLabel(name: string): name is DataLabel {
  return Object.hasOwn(DATA_LABELS, name);
}
