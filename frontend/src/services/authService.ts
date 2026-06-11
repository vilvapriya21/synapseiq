import apiClient from "./api";
import { AuthTokens, User } from "../types";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  tokens: AuthTokens;
  user: User;
}

export const authService = {
  login: (payload: LoginRequest) => apiClient.post<LoginResponse>("/auth/login", payload),
  me: () => apiClient.get<User>("/auth/me"),
};
