/**
 * Sensitivity Classifier
 *
 * Tier 2 of the PolicyEngine. Classifies a request's resource (domain,
 * element, or tool manifest) and emits the data labels that should attach
 * to data the action produces. The labels then propagate through Tier 3's
 * information-flow check.
 *
 * Classifiers are intentionally conservative: when in doubt, *attach* a
 * label rather than skip one. The engine will ask, the user will confirm,
 * and the audit log will surface false positives so we can tighten rules.
 *
 * See `docs/PERMISSIONS.md` (Part 1: How it works → "Sensitivity gates and
 * tool manifest provenance") for the conceptual model.
 */

import type { DataLabel } from './labels';
import { LabelSet } from './labels';

// =============================================================================
// Types
// =============================================================================

/**
 * Confidence in a classifier verdict. Higher confidence means the engine
 * acts on it without further qualification; lower confidence flags it as a
 * "may be sensitive" hint that the policy file or the user can override.
 */
export type Confidence = 'low' | 'medium' | 'high';

export interface SensitivityVerdict {
  /** Labels to attach to data this action produces. */
  labels: LabelSet;
  /** How confident the classifier is. */
  confidence: Confidence;
  /** Human-readable reason for the audit log. */
  reason: string;
  /**
   * Whether the verdict was derived from trusted manifest claims (vs.
   * heuristics). Used by the engine when deciding whether to honor
   * `reversible: true` and similar self-reports.
   */
  manifestTrusted?: boolean;
}

// =============================================================================
// Domain classifier
// =============================================================================

/**
 * Domain → label rules. Order matters: the first matching rule wins.
 *
 * The list is intentionally small. We don't try to enumerate every bank or
 * hospital portal in existence; we cover the common cases and let users
 * extend via their policy file.
 */
const DOMAIN_RULES: ReadonlyArray<{
  pattern: RegExp;
  labels: readonly DataLabel[];
  reason: string;
}> = [
  // Identity providers and SSO surfaces.
  {
    pattern: /(^|\.)accounts\.google\.com$/,
    labels: ['credentials', 'identity'],
    reason: 'Google account / SSO surface',
  },
  {
    pattern: /(^|\.)login\.microsoftonline\.com$/,
    labels: ['credentials', 'identity'],
    reason: 'Microsoft login / SSO surface',
  },
  {
    pattern: /(^|\.)appleid\.apple\.com$/,
    labels: ['credentials', 'identity'],
    reason: 'Apple ID surface',
  },
  {
    pattern: /(^|\.)okta\.com$/,
    labels: ['credentials', 'identity'],
    reason: 'Okta SSO surface',
  },

  // Payments / banking common patterns.
  {
    pattern: /(^|\.)stripe\.com$/,
    labels: ['payments'],
    reason: 'Stripe payment surface',
  },
  {
    pattern: /(^|\.)paypal\.com$/,
    labels: ['payments'],
    reason: 'PayPal payment surface',
  },
  {
    pattern: /\b(bank|chase|citi|wellsfargo|americanexpress|amex|capitalone)\b.*\.com$/i,
    labels: ['payments', 'identity'],
    reason: 'Likely banking domain',
  },

  // Personal workspaces — confidential by default.
  {
    pattern: /(^|\.)mail\.google\.com$/,
    labels: ['confidential'],
    reason: 'Personal email (Gmail)',
  },
  {
    pattern: /(^|\.)outlook\.(office|live)\.com$/,
    labels: ['confidential'],
    reason: 'Personal email (Outlook)',
  },
  {
    pattern: /(^|\.)slack\.com$/,
    labels: ['confidential'],
    reason: 'Slack workspace',
  },
  {
    pattern: /(^|\.)notion\.so$/,
    labels: ['confidential'],
    reason: 'Notion workspace',
  },
  {
    pattern: /(^|\.)docs\.google\.com$/,
    labels: ['confidential'],
    reason: 'Google Docs',
  },

  // Health / regulated.
  {
    pattern: /\b(myhealth|patient|kaiserpermanente|mychart)\b.*\.com$/i,
    labels: ['regulated', 'identity'],
    reason: 'Likely patient portal',
  },
];

/**
 * Classify a hostname. Returns an empty verdict if no rule matches.
 */
export function classifyDomain(host: string): SensitivityVerdict {
  const lower = host.toLowerCase();
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(lower)) {
      return {
        labels: new LabelSet(rule.labels),
        confidence: 'high',
        reason: rule.reason,
      };
    }
  }
  return { labels: LabelSet.empty(), confidence: 'low', reason: 'No matching domain rule' };
}

// =============================================================================
// Element classifier
// =============================================================================

/**
 * What the content script tells us about a DOM element. The agent never
 * gets the full DOM — content scripts inspect the requested selector and
 * return a structured descriptor that omits the actual value when the
 * element looks sensitive.
 */
export interface ElementDescriptor {
  /** HTML tag name in lowercase. */
  tag: string;
  /** Input type, if relevant. */
  type?: string;
  /** Element name attribute. */
  name?: string;
  /** Element id attribute. */
  id?: string;
  /** Autocomplete attribute. */
  autocomplete?: string;
  /** Aria-label or label text. */
  ariaLabel?: string;
  /** Placeholder text. */
  placeholder?: string;
  /** Whether the element is inside a form. */
  inForm?: boolean;
  /** Whether the form's action goes off-origin. */
  formActionCrossOrigin?: boolean;
}

const PASSWORD_AUTOCOMPLETE = new Set([
  'current-password',
  'new-password',
  'one-time-code',
]);
const PAYMENT_AUTOCOMPLETE = new Set([
  'cc-number',
  'cc-name',
  'cc-csc',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-type',
]);
const IDENTITY_AUTOCOMPLETE = new Set([
  'bday',
  'bday-day',
  'bday-month',
  'bday-year',
  'sex',
  'tel',
  'tel-national',
  'tel-area-code',
  'street-address',
  'address-line1',
  'address-line2',
  'postal-code',
  'country',
  'country-name',
]);

/**
 * Classify a DOM element. Used when the agent reads or interacts with a
 * specific element.
 */
export function classifyElement(el: ElementDescriptor): SensitivityVerdict {
  const labels = new Set<DataLabel>();
  const reasons: string[] = [];
  let confidence: Confidence = 'low';

  if (el.tag === 'input') {
    const type = el.type?.toLowerCase() ?? 'text';
    const ac = el.autocomplete?.toLowerCase() ?? '';

    if (type === 'password' || PASSWORD_AUTOCOMPLETE.has(ac)) {
      labels.add('credentials');
      reasons.push('password / one-time-code field');
      confidence = 'high';
    }

    if (PAYMENT_AUTOCOMPLETE.has(ac)) {
      labels.add('payments');
      reasons.push('payment autocomplete attribute');
      confidence = 'high';
    }

    if (IDENTITY_AUTOCOMPLETE.has(ac)) {
      labels.add('identity');
      reasons.push('identity autocomplete attribute');
      confidence = confidence === 'high' ? 'high' : 'medium';
    }

    // Heuristic name/id fallbacks.
    const tags = [el.name, el.id, el.placeholder, el.ariaLabel]
      .filter((s): s is string => !!s)
      .map((s) => s.toLowerCase());
    const has = (token: string) => tags.some((t) => t.includes(token));
    if (labels.size === 0) {
      if (has('password') || has('passwd')) {
        labels.add('credentials');
        reasons.push('field name suggests password');
        confidence = 'medium';
      }
      if (has('ssn') || has('social security') || has('national id')) {
        labels.add('identity');
        reasons.push('field name suggests SSN / national ID');
        confidence = 'high';
      }
      if (has('card') && (has('number') || has('cvv') || has('expir'))) {
        labels.add('payments');
        reasons.push('field name suggests card details');
        confidence = 'medium';
      }
    }
  }

  return {
    labels: new LabelSet(labels),
    confidence,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No element-level sensitivity detected',
  };
}

// =============================================================================
// Tool classifier
// =============================================================================

/**
 * The subset of an MCP tool manifest the classifier consumes. The full
 * manifest spec is out of scope here; this is just what the engine reads
 * for sensitivity decisions.
 */
export interface ToolManifestMeta {
  /** Server id. */
  server: string;
  /** Tool name. */
  tool: string;
  /** Whether this tool has a side effect (modifies external state). */
  sideEffect?: boolean;
  /** Whether the side effect is reversible. */
  reversible?: boolean;
  /** Whether the tool is idempotent (safe to retry). */
  idempotent?: boolean;
  /** Whether the tool offers a dry-run mode. */
  dryRun?: boolean;
  /** Risk tags the manifest claims (e.g. ["remote_write", "destructive"]). */
  riskTags?: readonly string[];
  /** Domains this tool egresses to (for label-flow analysis). */
  dataEgressDomains?: readonly string[];
  /** Identity scopes this tool requires (e.g. ["github.write"]). */
  requiredIdentityScopes?: readonly string[];
}

/**
 * Classify a tool. The result gates `tool.call` actions at Tier 2.
 *
 * `manifestTrusted` controls whether self-reports like `reversible: true`
 * are honored. When the manifest source is *untrusted* (downloaded by the
 * page, not signed, not policy-pinned), the classifier ignores the
 * positive claims and falls back to risk-tag heuristics.
 */
export function classifyTool(
  manifest: ToolManifestMeta,
  manifestTrusted: boolean,
): SensitivityVerdict {
  const labels = new Set<DataLabel>();
  const reasons: string[] = [];
  let confidence: Confidence = 'low';

  const tags = new Set((manifest.riskTags ?? []).map((t) => t.toLowerCase()));

  // Risk tags map to labels regardless of manifest trust — these are
  // *self-reported danger* claims, not safety claims, so honoring them is
  // strictly more conservative.
  if (tags.has('credentials') || tags.has('secrets')) {
    labels.add('credentials');
    reasons.push('manifest tag: credentials');
    confidence = 'high';
  }
  if (tags.has('payments') || tags.has('billing')) {
    labels.add('payments');
    reasons.push('manifest tag: payments');
    confidence = 'high';
  }
  if (tags.has('identity') || tags.has('auth')) {
    labels.add('identity');
    reasons.push('manifest tag: identity');
    confidence = 'high';
  }
  if (tags.has('regulated') || tags.has('phi') || tags.has('financial')) {
    labels.add('regulated');
    reasons.push('manifest tag: regulated');
    confidence = 'high';
  }
  if (tags.has('confidential') || tags.has('internal')) {
    labels.add('confidential');
    reasons.push('manifest tag: confidential');
    confidence = confidence === 'high' ? 'high' : 'medium';
  }

  // Heuristic on tool name when no tags were declared.
  if (labels.size === 0) {
    const toolName = manifest.tool.toLowerCase();
    if (/(secret|key|token|password|credential)/.test(toolName)) {
      labels.add('credentials');
      reasons.push('tool name suggests credentials handling');
      confidence = 'medium';
    } else if (/(payment|charge|invoice|billing|subscription)/.test(toolName)) {
      labels.add('payments');
      reasons.push('tool name suggests payments');
      confidence = 'medium';
    }
  }

  return {
    labels: new LabelSet(labels),
    confidence,
    reason: reasons.length > 0 ? reasons.join('; ') : 'No tool-level sensitivity detected',
    manifestTrusted,
  };
}

/**
 * Decide whether a manifest's claim of reversibility should be honored.
 * Only trusted manifests get to assert `reversible: true`; untrusted
 * manifests are treated as worst-case (irreversible) regardless of what
 * they say.
 */
export function effectiveReversibility(
  manifest: ToolManifestMeta,
  manifestTrusted: boolean,
): boolean {
  if (!manifestTrusted) return false;
  return manifest.reversible === true;
}

/**
 * Decide whether a manifest's claim of "no side effect" should be honored.
 * Same trust gating as reversibility.
 */
export function effectiveSideEffect(
  manifest: ToolManifestMeta,
  manifestTrusted: boolean,
): boolean {
  if (!manifestTrusted) return true;
  return manifest.sideEffect ?? true;
}

// =============================================================================
// Combined verdict
// =============================================================================

/**
 * Merge a list of verdicts. The combined verdict's labels are the union;
 * confidence is the maximum; the reason is a "; "-joined list of reasons.
 */
export function mergeVerdicts(verdicts: readonly SensitivityVerdict[]): SensitivityVerdict {
  let labels = LabelSet.empty();
  let confidence: Confidence = 'low';
  const reasons: string[] = [];
  let manifestTrusted: boolean | undefined;
  for (const v of verdicts) {
    labels = labels.union(v.labels);
    if (rank(v.confidence) > rank(confidence)) confidence = v.confidence;
    if (v.reason) reasons.push(v.reason);
    if (v.manifestTrusted !== undefined) manifestTrusted = v.manifestTrusted;
  }
  return {
    labels,
    confidence,
    reason: reasons.join('; ') || 'No sensitivity detected',
    manifestTrusted,
  };
}

function rank(c: Confidence): number {
  return c === 'high' ? 2 : c === 'medium' ? 1 : 0;
}
