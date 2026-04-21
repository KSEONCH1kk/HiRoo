"use client";
import _sodium from "libsodium-wrappers";

const LS_SK = "hiroo-e2ee-sk";
const LS_PK = "hiroo-e2ee-pk";
const LS_SIGN_SK = "hiroo-e2ee-sign-sk";
const LS_SIGN_PK = "hiroo-e2ee-sign-pk";

let ready = false;
let sodium: typeof _sodium;

export async function initSodium(): Promise<typeof _sodium> {
  if (ready) return sodium;
  await _sodium.ready;
  sodium = _sodium;
  ready = true;
  return sodium;
}

export interface KeyPair { publicKey: string; secretKey: string; }
export interface IdentityKeys { box: KeyPair; sign: KeyPair; }

/** Load existing keypairs from localStorage or generate+persist new ones. */
export async function ensureKeys(): Promise<IdentityKeys> {
  const s = await initSodium();
  if (typeof localStorage === "undefined") throw new Error("localStorage unavailable");

  let boxSk = localStorage.getItem(LS_SK);
  let boxPk = localStorage.getItem(LS_PK);
  if (!boxSk || !boxPk) {
    const kp = s.crypto_box_keypair();
    boxPk = s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL);
    boxSk = s.to_base64(kp.privateKey, s.base64_variants.ORIGINAL);
    localStorage.setItem(LS_SK, boxSk);
    localStorage.setItem(LS_PK, boxPk);
  }

  let signSk = localStorage.getItem(LS_SIGN_SK);
  let signPk = localStorage.getItem(LS_SIGN_PK);
  if (!signSk || !signPk) {
    const kp = s.crypto_sign_keypair();
    signPk = s.to_base64(kp.publicKey, s.base64_variants.ORIGINAL);
    signSk = s.to_base64(kp.privateKey, s.base64_variants.ORIGINAL);
    localStorage.setItem(LS_SIGN_SK, signSk);
    localStorage.setItem(LS_SIGN_PK, signPk);
  }

  return {
    box: { publicKey: boxPk, secretKey: boxSk },
    sign: { publicKey: signPk, secretKey: signSk },
  };
}

export function getMySigningPublicKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LS_SIGN_PK);
}

function getMySigningSecretKeyBytes(): Uint8Array | null {
  if (typeof localStorage === "undefined") return null;
  const b = localStorage.getItem(LS_SIGN_SK);
  if (!b) return null;
  return sodium.from_base64(b, sodium.base64_variants.ORIGINAL);
}

export function getMyPublicKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LS_PK);
}

function getMySecretKeyBytes(): Uint8Array | null {
  if (typeof localStorage === "undefined") return null;
  const b = localStorage.getItem(LS_SK);
  if (!b) return null;
  return sodium.from_base64(b, sodium.base64_variants.ORIGINAL);
}

function b64e(b: Uint8Array): string {
  return sodium.to_base64(b, sodium.base64_variants.ORIGINAL);
}
function b64d(s: string): Uint8Array {
  return sodium.from_base64(s, sodium.base64_variants.ORIGINAL);
}

// ── 1:1 direct (X25519 + authenticated box) ─────────────────

export const DIRECT_PREFIX = "E2EE1:";
export const GROUP_PREFIX = "E2EEG:";

export async function encryptDirect(plaintext: string, theirPublicKeyB64: string): Promise<string> {
  const s = await initSodium();
  const sk = getMySecretKeyBytes();
  if (!sk) throw new Error("no-key");
  const theirPk = b64d(theirPublicKeyB64);
  const nonce = s.randombytes_buf(s.crypto_box_NONCEBYTES);
  const ct = s.crypto_box_easy(s.from_string(plaintext), nonce, theirPk, sk);
  return `${DIRECT_PREFIX}${b64e(nonce)}.${b64e(ct)}`;
}

export async function decryptDirect(payload: string, theirPublicKeyB64: string): Promise<string> {
  const s = await initSodium();
  const sk = getMySecretKeyBytes();
  if (!sk) throw new Error("no-key");
  const body = payload.slice(DIRECT_PREFIX.length);
  const [nB, ctB] = body.split(".");
  const theirPk = b64d(theirPublicKeyB64);
  const pt = s.crypto_box_open_easy(b64d(ctB), b64d(nB), theirPk, sk);
  return s.to_string(pt);
}

// ── Group (random session key per message, sealed per recipient) ─

export interface GroupRecipient { userId: string; publicKey: string; }

export async function encryptGroup(plaintext: string, recipients: GroupRecipient[]): Promise<string> {
  const s = await initSodium();
  const sessionKey = s.randombytes_buf(s.crypto_secretbox_KEYBYTES);
  const nonce = s.randombytes_buf(s.crypto_secretbox_NONCEBYTES);
  const ct = s.crypto_secretbox_easy(s.from_string(plaintext), nonce, sessionKey);

  const envelopes: string[] = [];
  for (const r of recipients) {
    if (!r.publicKey) continue;
    const pk = b64d(r.publicKey);
    const sealed = s.crypto_box_seal(sessionKey, pk);
    envelopes.push(`${r.userId}~${b64e(sealed)}`);
  }
  return `${GROUP_PREFIX}${b64e(nonce)}.${b64e(ct)}.${envelopes.join(",")}`;
}

export async function decryptGroup(payload: string): Promise<string> {
  const s = await initSodium();
  const sk = getMySecretKeyBytes();
  const pkB = getMyPublicKey();
  if (!sk || !pkB) throw new Error("no-key");
  const pk = b64d(pkB);
  const body = payload.slice(GROUP_PREFIX.length);
  const [nonceB, ctB, envsRaw] = body.split(".");
  const envs = (envsRaw ?? "").split(",");
  // Find envelope for me — by trying each (we can't reliably pin by userId
  // because we might not know our own id here; sealed_box is anonymous).
  // Instead, format is "userId~sealed" so we can locate.
  const myId = (typeof localStorage !== "undefined" && localStorage.getItem("hiroo-auth-id")) || null;
  let sessionKey: Uint8Array | null = null;
  for (const e of envs) {
    const [uid, sealedB] = e.split("~");
    if (myId && uid !== myId) continue;
    try {
      sessionKey = s.crypto_box_seal_open(b64d(sealedB), pk, sk);
      break;
    } catch {}
  }
  if (!sessionKey) {
    // Fallback: try every envelope (in case myId wasn't set)
    for (const e of envs) {
      const [, sealedB] = e.split("~");
      if (!sealedB) continue;
      try { sessionKey = s.crypto_box_seal_open(b64d(sealedB), pk, sk); break; } catch {}
    }
  }
  if (!sessionKey) throw new Error("not-recipient");
  const pt = s.crypto_secretbox_open_easy(b64d(ctB), b64d(nonceB), sessionKey);
  return s.to_string(pt);
}

export function isEncrypted(content: string): boolean {
  return content.startsWith(DIRECT_PREFIX) || content.startsWith(GROUP_PREFIX);
}

// ── Shared symmetric key for voice (X25519 → symmetric) ───

/** Derive a symmetric 32-byte key for a 1:1 voice session with the other user. */
export async function deriveSharedKey(theirPublicKeyB64: string): Promise<Uint8Array> {
  const s = await initSodium();
  const sk = getMySecretKeyBytes();
  if (!sk) throw new Error("no-key");
  const theirPk = b64d(theirPublicKeyB64);
  // kx API: derive rx/tx. We want a single shared secret so hash the raw scalarmult output.
  const shared = s.crypto_scalarmult(sk, theirPk);
  return s.crypto_generichash(32, shared);
}

/** Derive a group voice key by hashing sorted participant public keys + dm id. */
export async function deriveGroupKey(dmId: string, publicKeysSorted: string[]): Promise<Uint8Array> {
  const s = await initSodium();
  const payload = dmId + "|" + publicKeysSorted.join("|");
  return s.crypto_generichash(32, s.from_string(payload));
}

// ── MLS-lite: ephemeral keys + signed bundle exchange ─────────

export interface EphemeralPair { publicKey: Uint8Array; secretKey: Uint8Array; }

export async function createEphemeralKeypair(): Promise<EphemeralPair> {
  const s = await initSodium();
  const kp = s.crypto_box_keypair();
  return { publicKey: kp.publicKey, secretKey: kp.privateKey };
}

export interface SignedBundle {
  roomId: string;
  userId: string;
  epoch: number;
  ephPk: string;         // base64
  ts: number;
  sig: string;           // base64 Ed25519 signature over canonical JSON of the above
}

function canonicalize(b: Omit<SignedBundle, "sig">): string {
  return JSON.stringify({
    roomId: b.roomId, userId: b.userId, epoch: b.epoch, ephPk: b.ephPk, ts: b.ts,
  });
}

export async function signBundle(unsigned: Omit<SignedBundle, "sig">): Promise<SignedBundle> {
  const s = await initSodium();
  const sk = getMySigningSecretKeyBytes();
  if (!sk) throw new Error("no-signing-key");
  const sig = s.crypto_sign_detached(s.from_string(canonicalize(unsigned)), sk);
  return { ...unsigned, sig: s.to_base64(sig, s.base64_variants.ORIGINAL) };
}

export async function verifyBundle(b: SignedBundle, signerPublicKeyB64: string): Promise<boolean> {
  const s = await initSodium();
  try {
    const pk = b64d(signerPublicKeyB64);
    const sig = b64d(b.sig);
    return s.crypto_sign_verify_detached(sig, s.from_string(canonicalize(b)), pk);
  } catch {
    return false;
  }
}

/** Per-epoch key: combine sorted ephemeral pubkeys (hex-normalized) with roomId + epoch. */
export async function deriveEpochKey(roomId: string, epoch: number, ephPksB64: string[]): Promise<Uint8Array> {
  const s = await initSodium();
  const sorted = [...ephPksB64].sort();
  const blob = s.from_string(`${roomId}|${epoch}|${sorted.join("|")}`);
  return s.crypto_generichash(32, blob);
}

/** Human-readable safety code (like Signal's safety number): hash of the key → 6 groups of 5 digits. */
export async function safetyCode(key: Uint8Array): Promise<string> {
  const s = await initSodium();
  const hash = s.crypto_generichash(30, key);
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const slice = hash.slice(i * 5, i * 5 + 5);
    let n = 0n;
    for (const b of slice) n = (n << 8n) | BigInt(b);
    groups.push((n % 100000n).toString().padStart(5, "0"));
  }
  return groups.join(" ");
}
