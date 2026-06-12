import axios from "axios";
import { ENV } from "../constants/env";
import { ACCESS_TOKEN_KEY, SESSION_ACCESS_TOKEN_KEY } from "../store/authStore";

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

export default apiClient;
