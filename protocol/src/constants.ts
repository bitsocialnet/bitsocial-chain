/**
 * Protocol identifier carried in every intent payload. Transactions whose
 * payload declares a different protocol are rejected deterministically.
 */
export const PROTOCOL_ID = "bso-chain";

/** Intent payload schema version understood by this implementation. */
export const INTENT_SCHEMA_VERSION = 1;

/**
 * The designated L1 intent address (lowercase canonical form).
 *
 * A transaction is considered a .bso intent attempt if and only if it is sent
 * to this address and its calldata starts with {@link INTENT_DATA_URI_PREFIX}.
 *
 * This mirrors the Facet pattern of a magic "inbox" address: the address has
 * no code and no known private key, so transactions to it are plain L1 data
 * carriers. No contract is required for correctness — all rules live in the
 * derivation layer.
 */
export const BSO_INTENT_ADDRESS = "0x0000000000000000000000000000000000b50b50";

/**
 * Calldata prefix (UTF-8) marking a .bso intent, in the spirit of
 * Ethscriptions data-URI calldata. The remainder of the calldata after this
 * prefix must be a single UTF-8 JSON object (the intent payload).
 */
export const INTENT_DATA_URI_PREFIX = "data:application/vnd.bso.intent+json,";

/** Maximum length of the label (the part before ".bso"). DNS-style limit. */
export const MAX_LABEL_LENGTH = 63;

/** Maximum length of a metadata URI accepted by the registry. */
export const MAX_METADATA_URI_LENGTH = 512;
