"use client";
import { BaseKeyProvider } from "livekit-client";

/**
 * Extends livekit-client's BaseKeyProvider to expose per-participant key slots.
 * The stock ExternalE2EEKeyProvider in 2.5.x only supports a single shared key
 * (setKey(string)), which doesn't work for the per-sender scheme used by server
 * voice channels. We import the passphrase via PBKDF2 exactly like the stock
 * provider does, then forward it to the protected onSetEncryptionKey hook so
 * the LK e2ee worker can derive the same AES-GCM key on every client.
 */
export class HiRooKeyProvider extends BaseKeyProvider {
  async setKey(key: string, participantIdentity?: string, keyIndex?: number): Promise<void> {
    const encoded = new TextEncoder().encode(key);
    const material = await crypto.subtle.importKey(
      "raw",
      encoded,
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"],
    );
    // onSetEncryptionKey is protected on BaseKeyProvider; subclasses may call it.
    // TS can't prove this at the call site when accessed dynamically, so cast.
    (this as unknown as {
      onSetEncryptionKey(m: CryptoKey, id?: string, idx?: number): void;
    }).onSetEncryptionKey(material, participantIdentity, keyIndex);
  }
}
