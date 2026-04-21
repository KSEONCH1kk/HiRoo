"use client";
import { useEffect } from "react";
import { ensureKeys } from "@/lib/e2ee";
import { useAuthStore } from "@/store/authStore";
import { usersApi } from "@/lib/api";

/**
 * On login: generate (or load) X25519 keypair and make sure the server knows
 * our current public key. Also persist our own user id for group envelope routing.
 */
export function useE2EEInit() {
  const { user, updateUser } = useAuthStore();
  useEffect(() => {
    if (!user?.id) return;
    try { localStorage.setItem("hiroo-auth-id", user.id); } catch {}
    (async () => {
      try {
        const { publicKey } = await ensureKeys();
        if (user.public_key !== publicKey) {
          const updated = await usersApi.setPublicKey(publicKey);
          updateUser(updated);
        }
      } catch (e) {
        // non-fatal — E2EE is best-effort
        console.warn("E2EE init failed", e);
      }
    })();
  }, [user?.id]);
}
