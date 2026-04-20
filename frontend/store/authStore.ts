import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types";
import { tokenStore } from "@/lib/auth";

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  updateUser: (patch: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      setAuth: (user, token) => {
        tokenStore.set(token);
        set({ user, accessToken: token });
      },
      clearAuth: () => {
        tokenStore.clear();
        set({ user: null, accessToken: null });
      },
      updateUser: (patch) =>
        set((s) => ({ user: s.user ? { ...s.user, ...patch } : null })),
    }),
    {
      name: "hiroo-auth",
      partialState: (s: AuthState) => ({ accessToken: s.accessToken, user: s.user }),
      onRehydrateStorage: () => (state: AuthState | undefined) => {
        if (state?.accessToken) tokenStore.set(state.accessToken);
      },
    } as any,
  ),
);
