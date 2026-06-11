import { create } from "zustand";
import { AuthTokens, User } from "../types";

interface AuthState {
  isAuthenticated: boolean;
  tokens: AuthTokens | null;
  user: User | null;
  login: (user: User, tokens: AuthTokens) => void;
  logout: () => void;
}

const ACCESS_TOKEN_KEY = "synapseiq.accessToken";
const REFRESH_TOKEN_KEY = "synapseiq.refreshToken";

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: Boolean(localStorage.getItem(ACCESS_TOKEN_KEY)),
  tokens: localStorage.getItem(ACCESS_TOKEN_KEY)
    ? {
        accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) as string,
        refreshToken: localStorage.getItem(REFRESH_TOKEN_KEY) || undefined,
      }
    : null,
  user: null,
  login: (user, tokens) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
    if (tokens.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
    }
    set({ isAuthenticated: true, tokens, user });
  },
  logout: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    set({ isAuthenticated: false, tokens: null, user: null });
  },
}));

export { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY };
