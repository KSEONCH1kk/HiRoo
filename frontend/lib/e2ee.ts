"use client";
import nacl from "tweetnacl";
import naclUtil from "tweetnacl-util";
import sealedbox from "tweetnacl-sealedbox-js";

const LS_SK = "hiroo-e2ee-sk";
const LS_PK = "hiroo-e2ee-pk";
const LS_SIGN_SK = "hiroo-e2ee-sign-sk";
const LS_SIGN_PK = "hiroo-e2ee-sign-pk";

const { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } = naclUtil;

/** No-op for API compatibility; tweetnacl doesn't need async init. */
export async function initSodium(): Promise<void> { /* noop */ }

export interface KeyPair { publicKey: string; secretKey: string; }
export interface IdentityKeys { box: KeyPair; sign: KeyPair; }

export async function ensureKeys(): Promise<IdentityKeys> {
  if (typeof localStorage === "undefined") throw new Error("localStorage unavailable");

  let boxSk = localStorage.getItem(LS_SK);
  let boxPk = localStorage.getItem(LS_PK);
  if (!boxSk || !boxPk) {
    const kp = nacl.box.keyPair();
    boxPk = encodeBase64(kp.publicKey);
    boxSk = encodeBase64(kp.secretKey);
    localStorage.setItem(LS_SK, boxSk);
    localStorage.setItem(LS_PK, boxPk);
  }

  let signSk = localStorage.getItem(LS_SIGN_SK);
  let signPk = localStorage.getItem(LS_SIGN_PK);
  if (!signSk || !signPk) {
    const kp = nacl.sign.keyPair();
    signPk = encodeBase64(kp.publicKey);
    signSk = encodeBase64(kp.secretKey);
    localStorage.setItem(LS_SIGN_SK, signSk);
    localStorage.setItem(LS_SIGN_PK, signPk);
  }

  return {
    box: { publicKey: boxPk, secretKey: boxSk },
    sign: { publicKey: signPk, secretKey: signSk },
  };
}

export function getMyPublicKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LS_PK);
}

export function getMySigningPublicKey(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(LS_SIGN_PK);
}

function getMyBoxSecretKeyBytes(): Uint8Array | null {
  if (typeof localStorage === "undefined") return null;
  const b = localStorage.getItem(LS_SK);
  return b ? decodeBase64(b) : null;
}

function getMySigningSecretKeyBytes(): Uint8Array | null {
  if (typeof localStorage === "undefined") return null;
  const b = localStorage.getItem(LS_SIGN_SK);
  return b ? decodeBase64(b) : null;
}

// ── Legacy helpers kept for backward-compat (direct DM / group text) ─────

export const DIRECT_PREFIX = "E2EE1:";
export const GROUP_PREFIX = "E2EEG:";

export function isEncrypted(content: string): boolean {
  return content.startsWith(DIRECT_PREFIX) || content.startsWith(GROUP_PREFIX);
}

export async function encryptDirect(plaintext: string, theirPublicKeyB64: string): Promise<string> {
  const sk = getMyBoxSecretKeyBytes();
  if (!sk) throw new Error("no-key");
  const theirPk = decodeBase64(theirPublicKeyB64);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ct = nacl.box(decodeUTF8(plaintext), nonce, theirPk, sk);
  return `${DIRECT_PREFIX}${encodeBase64(nonce)}.${encodeBase64(ct)}`;
}

export async function decryptDirect(payload: string, theirPublicKeyB64: string): Promise<string> {
  const sk = getMyBoxSecretKeyBytes();
  if (!sk) throw new Error("no-key");
  const [nB, ctB] = payload.slice(DIRECT_PREFIX.length).split(".");
  const pt = nacl.box.open(decodeBase64(ctB), decodeBase64(nB), decodeBase64(theirPublicKeyB64), sk);
  if (!pt) throw new Error("decrypt-failed");
  return encodeUTF8(pt);
}

/** Encrypt arbitrary bytes to a recipient's box public key (anonymous, sealed_box). */
export function sealTo(message: Uint8Array, recipientPublicKeyB64: string): string {
  const theirPk = decodeBase64(recipientPublicKeyB64);
  return encodeBase64(sealedbox.seal(message, theirPk));
}

/** Open a sealed envelope with our own box keypair. Returns null if it wasn't for us. */
export function openSealed(envelopeB64: string): Uint8Array | null {
  const sk = getMyBoxSecretKeyBytes();
  const pkB = getMyPublicKey();
  if (!sk || !pkB) return null;
  const pk = decodeBase64(pkB);
  return sealedbox.open(decodeBase64(envelopeB64), pk, sk);
}

/** Generate a 32-byte random session key for frame encryption. */
export function randomSessionKey(): Uint8Array {
  return nacl.randomBytes(32);
}

export interface GroupRecipient { userId: string; publicKey: string; }

export async function encryptGroup(plaintext: string, recipients: GroupRecipient[]): Promise<string> {
  const sessionKey = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const ct = nacl.secretbox(decodeUTF8(plaintext), nonce, sessionKey);
  const envelopes = recipients
    .filter((r) => !!r.publicKey)
    .map((r) => `${r.userId}~${encodeBase64(sealedbox.seal(sessionKey, decodeBase64(r.publicKey)))}`);
  return `${GROUP_PREFIX}${encodeBase64(nonce)}.${encodeBase64(ct)}.${envelopes.join(",")}`;
}

export async function decryptGroup(payload: string): Promise<string> {
  const sk = getMyBoxSecretKeyBytes();
  const pkB = getMyPublicKey();
  if (!sk || !pkB) throw new Error("no-key");
  const pk = decodeBase64(pkB);
  const [nonceB, ctB, envsRaw] = payload.slice(GROUP_PREFIX.length).split(".");
  const envs = (envsRaw ?? "").split(",");
  const myId = (typeof localStorage !== "undefined" && localStorage.getItem("hiroo-auth-id")) || null;
  let sessionKey: Uint8Array | null = null;
  for (const e of envs) {
    const [uid, sealedB] = e.split("~");
    if (myId && uid !== myId) continue;
    if (!sealedB) continue;
    const opened = sealedbox.open(decodeBase64(sealedB), pk, sk);
    if (opened) { sessionKey = opened; break; }
  }
  if (!sessionKey) {
    for (const e of envs) {
      const [, sealedB] = e.split("~");
      if (!sealedB) continue;
      const opened = sealedbox.open(decodeBase64(sealedB), pk, sk);
      if (opened) { sessionKey = opened; break; }
    }
  }
  if (!sessionKey) throw new Error("not-recipient");
  const pt = nacl.secretbox.open(decodeBase64(ctB), decodeBase64(nonceB), sessionKey);
  if (!pt) throw new Error("decrypt-failed");
  return encodeUTF8(pt);
}

// ── Voice: static derivations (legacy fallback) ────────────────────────

/** SHA-512 truncated to 32 bytes — used for key derivation. */
function sha512trunc32(bytes: Uint8Array): Uint8Array {
  return nacl.hash(bytes).slice(0, 32);
}

/** Derive symmetric key for 1:1 via X25519 scalar multiplication. */
export async function deriveSharedKey(theirPublicKeyB64: string): Promise<Uint8Array> {
  const sk = getMyBoxSecretKeyBytes();
  if (!sk) throw new Error("no-key");
  const theirPk = decodeBase64(theirPublicKeyB64);
  const shared = nacl.scalarMult(sk, theirPk);
  return sha512trunc32(shared);
}

/** Derive deterministic group key from dm id + sorted public keys. */
export async function deriveGroupKey(dmId: string, publicKeysSorted: string[]): Promise<Uint8Array> {
  const payload = dmId + "|" + publicKeysSorted.join("|");
  return sha512trunc32(decodeUTF8(payload));
}

// ── MLS-lite: per-session ephemeral key + signed bundle exchange ─────────

export interface EphemeralPair { publicKey: Uint8Array; secretKey: Uint8Array; }

export async function createEphemeralKeypair(): Promise<EphemeralPair> {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export async function bytesToB64(bytes: Uint8Array): Promise<string> {
  return encodeBase64(bytes);
}

export interface SignedBundle {
  roomId: string;
  userId: string;
  epoch: number;
  ephPk: string;
  ts: number;
  sig: string;
}

function canonicalize(b: Omit<SignedBundle, "sig">): string {
  return JSON.stringify({
    roomId: b.roomId, userId: b.userId, epoch: b.epoch, ephPk: b.ephPk, ts: b.ts,
  });
}

export async function signBundle(unsigned: Omit<SignedBundle, "sig">): Promise<SignedBundle> {
  const sk = getMySigningSecretKeyBytes();
  if (!sk) throw new Error("no-signing-key");
  const sig = nacl.sign.detached(decodeUTF8(canonicalize(unsigned)), sk);
  return { ...unsigned, sig: encodeBase64(sig) };
}

export async function verifyBundle(b: SignedBundle, signerPublicKeyB64: string): Promise<boolean> {
  try {
    return nacl.sign.detached.verify(
      decodeUTF8(canonicalize(b)),
      decodeBase64(b.sig),
      decodeBase64(signerPublicKeyB64),
    );
  } catch {
    return false;
  }
}

export async function deriveEpochKey(roomId: string, epoch: number, ephPksB64: string[]): Promise<Uint8Array> {
  const sorted = [...ephPksB64].sort();
  const blob = decodeUTF8(`${roomId}|${epoch}|${sorted.join("|")}`);
  return sha512trunc32(blob);
}

/** 6 groups of 5 digits from hash of the key (Signal-style safety number). */
export async function safetyCode(key: Uint8Array): Promise<string> {
  const hash = nacl.hash(key).slice(0, 30);
  const groups: string[] = [];
  for (let i = 0; i < 6; i++) {
    const slice = hash.slice(i * 5, i * 5 + 5);
    let n = 0;
    for (const b of slice) n = (n * 256 + b) % 100000;
    groups.push(n.toString().padStart(5, "0"));
  }
  return groups.join(" ");
}
