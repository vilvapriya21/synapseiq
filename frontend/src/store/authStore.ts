import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthTokens, User } from "../types";

interface AuthState {
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  user: User | null;
  rememberMe: boolean;
  login: (user: User, tokens: AuthTokens, rememberMe?: boolean) => void;
  logout: () => void;
}

const ACCESS_TOKEN_KEY = "synapseiq.accessToken";
const REFRESH_TOKEN_KEY = "synapseiq.refreshToken";
const SESSION_ACCESS_TOKEN_KEY = "synapseiq.sessionAccessToken";
const SESSION_REFRESH_TOKEN_KEY = "synapseiq.sessionRefreshToken";

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      tokens: null,
      user: null,
      rememberMe: true,
      login: (user, tokens, rememberMe = true) => {
        const tokenStorage = rememberMe ? localStorage : sessionStorage;
        const alternateStorage = rememberMe ? sessionStorage : localStorage;

        tokenStorage.setItem(rememberMe ? ACCESS_TOKEN_KEY : SESSION_ACCESS_TOKEN_KEY, tokens.accessToken);
        alternateStorage.removeItem(rememberMe ? SESSION_ACCESS_TOKEN_KEY : ACCESS_TOKEN_KEY);
        if (tokens.refreshToken) {
          tokenStorage.setItem(rememberMe ? REFRESH_TOKEN_KEY : SESSION_REFRESH_TOKEN_KEY, tokens.refreshToken);
        }
        alternateStorage.removeItem(rememberMe ? SESSION_REFRESH_TOKEN_KEY : REFRESH_TOKEN_KEY);
        set({ isAuthenticated: true, tokens, user, rememberMe });
      },
      logout: () => {
        localStorage.removeItem(ACCESS_TOKEN_KEY);
        localStorage.removeItem(REFRESH_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_REFRESH_TOKEN_KEY);
        set({ isAuthenticated: false, tokens: null, user: null });
      },
    }),
    {
      name: "synapseiq.auth",
      partialize: (state) =>
        state.rememberMe
          ? {
              isAuthenticated: state.isAuthenticated,
              tokens: state.tokens,
              user: state.user,
              rememberMe: state.rememberMe,
            }
          : { rememberMe: false },
      onRehydrateStorage: () => (state) => {
        if (state?.tokens?.accessToken) {
          localStorage.setItem(ACCESS_TOKEN_KEY, state.tokens.accessToken);
        }
      },
    },
  ),
);

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };
export { SESSION_ACCESS_TOKEN_KEY, SESSION_REFRESH_TOKEN_KEY };
