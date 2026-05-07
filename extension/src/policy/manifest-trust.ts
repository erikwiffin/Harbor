/**
 * Manifest Trust Registry
 *
 * MCP tool manifests carry self-reported claims (reversible, sideEffect,
 * dryRun, riskTags, dataEgressDomains, requiredIdentityScopes). Some of
 * those claims, if honored uncritically, would let a malicious server
 * downgrade Harbor's safety floor — a server could declare every action
 * `reversible: true` to skip preview prompts.
 *
 * The trust registry decides which manifest sources we honor for *positive*
 * claims (reversible / no-side-effect). The list is intentionally small:
 *   - **bundled**: shipped inside the Harbor extension itself.
 *   - **localInstall**: installed by the user via the local install flow.
 *   - **signed**: cryptographically signed by a publisher key the user
 *      has accepted.
 *   - **policyPinned**: explicitly pinned in the user's `harbor-policy.json`.
 *
 * Anything else (page-declared MCP servers, ad-hoc registrations, fetched
 * manifests) is *untrusted*. The classifier still reads risk tags from
 * untrusted manifests because those are self-reported danger and honoring
 * them is strictly more conservative.
 *
 * See `docs/PERMISSIONS.md` (Part 1: How it works → "Sensitivity gates and
 * tool manifest provenance").
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Where did a manifest come from? The classification determines whether
 * the manifest's positive safety claims are honored.
 */
export type ManifestSource =
  | 'bundled'
  | 'localInstall'
  | 'signed'
  | 'policyPinned'
  | 'pageDeclared'
  | 'fetched'
  | 'unknown';

/**
 * Trust verdict for a specific manifest. The engine uses `trusted` directly;
 * `source` and `reason` go into the audit log.
 */
export interface ManifestTrustVerdict {
  trusted: boolean;
  source: ManifestSource;
  reason: string;
}

/**
 * Identifying information the trust registry needs to classify a manifest.
 */
export interface ManifestProvenance {
  /** Server id (matches the value in the manifest itself). */
  serverId: string;
  /** Where the manifest came from. */
  source: ManifestSource;
  /** Optional signature; verified against pinned publisher keys. */
  signature?: ManifestSignature;
  /** SHA-256 hash of the manifest as registered. Used for pinning. */
  manifestHash?: string;
  /** When this provenance was recorded. */
  recordedAt?: number;
}

export interface ManifestSignature {
  /** Algorithm. Currently only ed25519 is recognized. */
  algorithm: 'ed25519';
  /** Base64-url public key. Must be present in the publisher registry. */
  publicKey: string;
  /** Base64-url signature over the manifest hash. */
  signature: string;
}

// =============================================================================
// Publisher registry
// =============================================================================

/**
 * A publisher key the user has accepted. Adding a publisher is a deliberate
 * user action (sidebar → Trusted publishers → Add). The default registry is
 * empty; bundled MCP manifests don't need a publisher because they're
 * trusted by virtue of being shipped with Harbor.
 */
export interface PublisherKey {
  /** Display name. */
  name: string;
  /** Algorithm; matches `ManifestSignature.algorithm`. */
  algorithm: 'ed25519';
  /** Base64-url public key. */
  publicKey: string;
  /** When the user added this publisher. */
  addedAt: number;
  /** Server id glob this publisher is allowed to sign for, e.g. "@anthropic/*". */
  allowedServerGlob?: string;
}

class PublisherRegistry {
  private keys = new Map<string, PublisherKey>();

  add(key: PublisherKey): void {
    this.keys.set(key.publicKey, { ...key });
  }

  remove(publicKey: string): boolean {
    return this.keys.delete(publicKey);
  }

  has(publicKey: string): boolean {
    return this.keys.has(publicKey);
  }

  get(publicKey: string): PublisherKey | undefined {
    return this.keys.get(publicKey);
  }

  list(): PublisherKey[] {
    return [...this.keys.values()];
  }

  /** Reset for tests. */
  __reset(): void {
    this.keys.clear();
  }
}

export const Publishers = new PublisherRegistry();

// =============================================================================
// Pin registry
// =============================================================================

/**
 * Manifests can be pinned by hash. A pinned manifest is trusted regardless
 * of source; the user has explicitly said "this exact manifest is OK."
 *
 * Pins are stored in the user's policy file and loaded on startup.
 */
class PinRegistry {
  /** Map of `serverId` → set of accepted manifest hashes. */
  private pins = new Map<string, Set<string>>();

  pin(serverId: string, manifestHash: string): void {
    let set = this.pins.get(serverId);
    if (!set) {
      set = new Set();
      this.pins.set(serverId, set);
    }
    set.add(manifestHash);
  }

  unpin(serverId: string, manifestHash: string): boolean {
    const set = this.pins.get(serverId);
    if (!set) return false;
    return set.delete(manifestHash);
  }

  isPinned(serverId: string, manifestHash: string): boolean {
    const set = this.pins.get(serverId);
    if (!set) return false;
    return set.has(manifestHash);
  }

  list(): { serverId: string; hashes: string[] }[] {
    return [...this.pins.entries()].map(([serverId, set]) => ({
      serverId,
      hashes: [...set].sort(),
    }));
  }

  __reset(): void {
    this.pins.clear();
  }
}

export const Pins = new PinRegistry();

// =============================================================================
// Verdict
// =============================================================================

/**
 * Decide whether a manifest's positive safety claims should be honored.
 */
export function trustManifest(provenance: ManifestProvenance): ManifestTrustVerdict {
  switch (provenance.source) {
    case 'bundled':
      return {
        trusted: true,
        source: 'bundled',
        reason: 'Manifest bundled with Harbor extension',
      };

    case 'localInstall':
      return {
        trusted: true,
        source: 'localInstall',
        reason: 'Manifest installed by the user via the local install flow',
      };

    case 'signed': {
      if (!provenance.signature) {
        return {
          trusted: false,
          source: 'signed',
          reason: 'Manifest claimed to be signed but no signature is attached',
        };
      }
      const publisher = Publishers.get(provenance.signature.publicKey);
      if (!publisher) {
        return {
          trusted: false,
          source: 'signed',
          reason: `Signature key ${provenance.signature.publicKey} is not in the publisher registry`,
        };
      }
      if (
        publisher.allowedServerGlob &&
        !globMatch(publisher.allowedServerGlob, provenance.serverId)
      ) {
        return {
          trusted: false,
          source: 'signed',
          reason: `Publisher ${publisher.name} is not allowed to sign for ${provenance.serverId}`,
        };
      }
      // We deliberately don't run a real ed25519 verification here — the
      // bridge process is the right place for that. This module just
      // records the policy. The bridge attaches `signature.verified=true`
      // before the manifest reaches us; if it isn't present, we treat the
      // signature as unverified.
      const verified = (provenance.signature as ManifestSignature & { verified?: boolean }).verified;
      if (verified === false) {
        return {
          trusted: false,
          source: 'signed',
          reason: 'Bridge could not verify the manifest signature',
        };
      }
      return {
        trusted: true,
        source: 'signed',
        reason: `Signed by ${publisher.name}`,
      };
    }

    case 'policyPinned': {
      if (!provenance.manifestHash) {
        return {
          trusted: false,
          source: 'policyPinned',
          reason: 'Manifest claimed pinned but no hash is attached',
        };
      }
      if (!Pins.isPinned(provenance.serverId, provenance.manifestHash)) {
        return {
          trusted: false,
          source: 'policyPinned',
          reason: `Manifest hash ${provenance.manifestHash} for ${provenance.serverId} is not pinned in the user's policy`,
        };
      }
      return {
        trusted: true,
        source: 'policyPinned',
        reason: 'Manifest hash matches a pin in the user\'s policy',
      };
    }

    case 'pageDeclared':
      return {
        trusted: false,
        source: 'pageDeclared',
        reason: 'Manifest declared by a web page; positive safety claims will not be honored',
      };

    case 'fetched':
      return {
        trusted: false,
        source: 'fetched',
        reason: 'Manifest fetched dynamically; positive safety claims will not be honored',
      };

    case 'unknown':
    default:
      return {
        trusted: false,
        source: 'unknown',
        reason: 'Manifest source unknown; treated as untrusted',
      };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function globMatch(pattern: string, value: string): boolean {
  if (pattern === '*' || pattern === '') return true;
  // Identical glob handling to rules.ts; copied to avoid the cross-module
  // dependency.
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}
