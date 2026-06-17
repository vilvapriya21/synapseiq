import axios from "axios";
import { ENV } from "../constants/env";
import {
  ACCESS_TOKEN_KEY,
  REFRESH_TOKEN_KEY,
  SESSION_ACCESS_TOKEN_KEY,
  SESSION_REFRESH_TOKEN_KEY,
  useAuthStore,
} from "../store/authStore";

export const apiClient = axios.create({
  baseURL: ENV.apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(SESSION_ACCESS_TOKEN_KEY);

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const requestUrl = String(error.config?.url || "");
    const isAuthRequest = requestUrl.startsWith("/auth/login") || requestUrl.startsWith("/auth/signup");

    if (status === 401 && !isAuthRequest) {
      localStorage.removeItem(ACCESS_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_ACCESS_TOKEN_KEY);
      sessionStorage.removeItem(SESSION_REFRESH_TOKEN_KEY);
      useAuthStore.getState().logout();

      if (window.location.pathname !== "/login") {
        window.location.replace("/login");
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
