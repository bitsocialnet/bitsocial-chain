import { isValidBsoName } from "@bitsocial/bso-chain-protocol";

export interface BsoChainResolverOptions {
  /** Base URL of a derivation node read API, e.g. "http://127.0.0.1:4150". */
  endpoint: string;
  /**
   * Identifier for this resolver instance, mirroring the `key` field of
   * `@bitsocial/bso-resolver` so it can slot into the same `nameResolvers`
   * arrays. Default "bso-chain".
   */
  key?: string;
}

export interface BsoChainResolveResult {
  name: string;
  owner: string;
  publicKey: string;
  metadataUri?: string;
  version: number;
  [key: string]: string | number | undefined;
}

function createAbortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * Minimal .bso resolver backed by a Bitsocial Chain derivation node.
 *
 * API shape mirrors `@bitsocial/bso-resolver` (the ENS-TXT-record based
 * resolver Bitsocial clients use today): `canResolve({ name })`,
 * `resolve({ name, abortSignal })` returning a result or `undefined`, and
 * `destroy()`. A client can therefore swap or stack the two resolvers.
 *
 * Trust note (POC): the resolver trusts the derivation node it queries the
 * same way a light Ethereum client trusts its RPC. Anyone can run their own
 * node against L1 and point the resolver at it; see POC_LIMITATIONS.md.
 */
export class BsoChainResolver {
  readonly key: string;
  readonly endpoint: string;

  private readonly destroyController = new AbortController();
  private destroyed = false;

  constructor({ endpoint, key }: BsoChainResolverOptions) {
    this.endpoint = endpoint.replace(/\/+$/, "");
    this.key = key ?? "bso-chain";
  }

  /** True when the name is a well-formed .bso name this resolver handles. */
  canResolve({ name }: { name: string }): boolean {
    return isValidBsoName(name);
  }

  /**
   * Resolve a .bso name to its registry record, or `undefined` when the name
   * is not registered (or has been revoked).
   */
  async resolve({
    name,
    abortSignal,
  }: {
    name: string;
    abortSignal?: AbortSignal;
  }): Promise<BsoChainResolveResult | undefined> {
    if (this.destroyed) {
      throw new Error("Cannot resolve after destroy() has been called.");
    }
    if (abortSignal?.aborted || this.destroyController.signal.aborted) {
      throw createAbortError();
    }

    const signal = abortSignal
      ? AbortSignal.any([this.destroyController.signal, abortSignal])
      : this.destroyController.signal;

    const response = await fetch(`${this.endpoint}/v1/names/${encodeURIComponent(name)}`, {
      signal,
    });

    if (response.status === 404 || response.status === 410) {
      // Unregistered or revoked: not resolvable, mirroring how the ENS-based
      // resolver returns undefined for missing TXT records.
      return undefined;
    }
    if (!response.ok) {
      throw new Error(
        `Failed to resolve "${name}": derivation node responded ${response.status}`,
      );
    }

    const record = (await response.json()) as BsoChainResolveResult;
    const result: BsoChainResolveResult = {
      name: record.name,
      owner: record.owner,
      publicKey: record.publicKey,
      version: record.version,
    };
    if (record.metadataUri !== undefined) {
      result.metadataUri = record.metadataUri;
    }
    return result;
  }

  /** Abort in-flight resolutions and mark the resolver unusable. */
  async destroy(): Promise<void> {
    this.destroyed = true;
    this.destroyController.abort();
  }
}
